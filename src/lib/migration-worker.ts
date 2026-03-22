import fs from "fs/promises";
import path from "path";
import { query, run, updateMigrationJob, saveDb } from "@/lib/db-imports";
import { putFile, getS3Config, getPlatformS3Config, getS3Client } from "../../lib/storage.js";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

interface MigrationFile {
  table: string;
  id: number;
  localPath: string;
  orgId: number;
  prefix: string;
  /** For contract_invoices which have two file columns */
  column?: "invoice" | "payment";
}

interface MigrationS3File {
  table: string;
  id: number;
  storageKey: string;
  orgId: number;
  prefix: string;
  column?: "invoice" | "payment";
}

function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Gather all files that need migration from the three document tables.
 */
function collectFilesToMigrate(): MigrationFile[] {
  const files: MigrationFile[] = [];

  // 1. documents table — path column holds local file path
  const docs = query(
    `SELECT d.id, d.path, d.org_id FROM documents d WHERE d.storage_backend = 'local' AND d.path IS NOT NULL AND d.org_id IS NOT NULL`
  ) as Array<{ id: number; path: string; org_id: number }>;

  for (const doc of docs) {
    files.push({
      table: "documents",
      id: doc.id,
      localPath: doc.path,
      orgId: doc.org_id,
      prefix: "documents",
    });
  }

  // 2. contract_documents — file_path column, org via contract_id → documents.org_id
  const contractDocs = query(
    `SELECT cd.id, cd.file_path, d.org_id
     FROM contract_documents cd
     JOIN documents d ON cd.contract_id = d.id
     WHERE cd.storage_backend = 'local' AND cd.file_path IS NOT NULL AND cd.document_id IS NULL AND d.org_id IS NOT NULL`
  ) as Array<{ id: number; file_path: string; org_id: number }>;

  for (const cd of contractDocs) {
    files.push({
      table: "contract_documents",
      id: cd.id,
      localPath: cd.file_path,
      orgId: cd.org_id,
      prefix: "contract-attachments",
    });
  }

  // 3. contract_invoices — two file columns: invoice_file_path and payment_confirmation_path
  const invoices = query(
    `SELECT ci.id, ci.invoice_file_path, ci.invoice_storage_backend,
            ci.payment_confirmation_path, ci.payment_storage_backend,
            d.org_id
     FROM contract_invoices ci
     JOIN documents d ON ci.contract_id = d.id
     WHERE d.org_id IS NOT NULL
       AND (
         (ci.invoice_storage_backend = 'local' AND ci.invoice_file_path IS NOT NULL)
         OR (ci.payment_storage_backend = 'local' AND ci.payment_confirmation_path IS NOT NULL)
       )`
  ) as Array<{
    id: number;
    invoice_file_path: string | null;
    invoice_storage_backend: string | null;
    payment_confirmation_path: string | null;
    payment_storage_backend: string | null;
    org_id: number;
  }>;

  for (const inv of invoices) {
    if (inv.invoice_storage_backend === "local" && inv.invoice_file_path) {
      files.push({
        table: "contract_invoices",
        id: inv.id,
        localPath: inv.invoice_file_path,
        orgId: inv.org_id,
        prefix: "invoices",
        column: "invoice",
      });
    }
    if (inv.payment_storage_backend === "local" && inv.payment_confirmation_path) {
      files.push({
        table: "contract_invoices",
        id: inv.id,
        localPath: inv.payment_confirmation_path,
        orgId: inv.org_id,
        prefix: "payment-confirmations",
        column: "payment",
      });
    }
  }

  return files;
}

/**
 * Gather local files for a specific org that need migration.
 */
function collectLocalFilesForOrg(orgId: number): MigrationFile[] {
  const files: MigrationFile[] = [];

  const docs = query(
    `SELECT d.id, d.path, d.org_id FROM documents d WHERE d.storage_backend = 'local' AND d.path IS NOT NULL AND d.org_id = ?`,
    [orgId]
  ) as Array<{ id: number; path: string; org_id: number }>;

  for (const doc of docs) {
    files.push({
      table: "documents",
      id: doc.id,
      localPath: doc.path,
      orgId: doc.org_id,
      prefix: "documents",
    });
  }

  const contractDocs = query(
    `SELECT cd.id, cd.file_path, d.org_id
     FROM contract_documents cd
     JOIN documents d ON cd.contract_id = d.id
     WHERE cd.storage_backend = 'local' AND cd.file_path IS NOT NULL AND cd.document_id IS NULL AND d.org_id = ?`,
    [orgId]
  ) as Array<{ id: number; file_path: string; org_id: number }>;

  for (const cd of contractDocs) {
    files.push({
      table: "contract_documents",
      id: cd.id,
      localPath: cd.file_path,
      orgId: cd.org_id,
      prefix: "contract-attachments",
    });
  }

  const invoices = query(
    `SELECT ci.id, ci.invoice_file_path, ci.invoice_storage_backend,
            ci.payment_confirmation_path, ci.payment_storage_backend,
            d.org_id
     FROM contract_invoices ci
     JOIN documents d ON ci.contract_id = d.id
     WHERE d.org_id = ?
       AND (
         (ci.invoice_storage_backend = 'local' AND ci.invoice_file_path IS NOT NULL)
         OR (ci.payment_storage_backend = 'local' AND ci.payment_confirmation_path IS NOT NULL)
       )`,
    [orgId]
  ) as Array<{
    id: number;
    invoice_file_path: string | null;
    invoice_storage_backend: string | null;
    payment_confirmation_path: string | null;
    payment_storage_backend: string | null;
    org_id: number;
  }>;

  for (const inv of invoices) {
    if (inv.invoice_storage_backend === "local" && inv.invoice_file_path) {
      files.push({
        table: "contract_invoices",
        id: inv.id,
        localPath: inv.invoice_file_path,
        orgId: inv.org_id,
        prefix: "invoices",
        column: "invoice",
      });
    }
    if (inv.payment_storage_backend === "local" && inv.payment_confirmation_path) {
      files.push({
        table: "contract_invoices",
        id: inv.id,
        localPath: inv.payment_confirmation_path,
        orgId: inv.org_id,
        prefix: "payment-confirmations",
        column: "payment",
      });
    }
  }

  return files;
}

/**
 * Gather files stored in org's own S3 (backend = 's3' or 'org_s3') for a specific org.
 */
function collectOwnS3FilesForOrg(orgId: number): MigrationS3File[] {
  const files: MigrationS3File[] = [];

  const docs = query(
    `SELECT d.id, d.storage_key, d.org_id FROM documents d WHERE d.storage_backend IN ('s3', 'org_s3') AND d.storage_key IS NOT NULL AND d.org_id = ?`,
    [orgId]
  ) as Array<{ id: number; storage_key: string; org_id: number }>;

  for (const doc of docs) {
    files.push({
      table: "documents",
      id: doc.id,
      storageKey: doc.storage_key,
      orgId: doc.org_id,
      prefix: "documents",
    });
  }

  const contractDocs = query(
    `SELECT cd.id, cd.storage_key, d.org_id
     FROM contract_documents cd
     JOIN documents d ON cd.contract_id = d.id
     WHERE cd.storage_backend IN ('s3', 'org_s3') AND cd.storage_key IS NOT NULL AND cd.document_id IS NULL AND d.org_id = ?`,
    [orgId]
  ) as Array<{ id: number; storage_key: string; org_id: number }>;

  for (const cd of contractDocs) {
    files.push({
      table: "contract_documents",
      id: cd.id,
      storageKey: cd.storage_key,
      orgId: cd.org_id,
      prefix: "contract-attachments",
    });
  }

  const invoices = query(
    `SELECT ci.id, ci.invoice_storage_key, ci.invoice_storage_backend,
            ci.payment_storage_key, ci.payment_storage_backend,
            d.org_id
     FROM contract_invoices ci
     JOIN documents d ON ci.contract_id = d.id
     WHERE d.org_id = ?
       AND (
         (ci.invoice_storage_backend IN ('s3', 'org_s3') AND ci.invoice_storage_key IS NOT NULL)
         OR (ci.payment_storage_backend IN ('s3', 'org_s3') AND ci.payment_storage_key IS NOT NULL)
       )`,
    [orgId]
  ) as Array<{
    id: number;
    invoice_storage_key: string | null;
    invoice_storage_backend: string | null;
    payment_storage_key: string | null;
    payment_storage_backend: string | null;
    org_id: number;
  }>;

  for (const inv of invoices) {
    if (
      (inv.invoice_storage_backend === "s3" || inv.invoice_storage_backend === "org_s3") &&
      inv.invoice_storage_key
    ) {
      files.push({
        table: "contract_invoices",
        id: inv.id,
        storageKey: inv.invoice_storage_key,
        orgId: inv.org_id,
        prefix: "invoices",
        column: "invoice",
      });
    }
    if (
      (inv.payment_storage_backend === "s3" || inv.payment_storage_backend === "org_s3") &&
      inv.payment_storage_key
    ) {
      files.push({
        table: "contract_invoices",
        id: inv.id,
        storageKey: inv.payment_storage_key,
        orgId: inv.org_id,
        prefix: "payment-confirmations",
        column: "payment",
      });
    }
  }

  return files;
}

/**
 * Update the DB record after successful S3 upload.
 */
function updateFileRecord(file: { table: string; id: number; column?: string }, storageBackend: string, storageKey: string) {
  if (file.table === "documents") {
    run(
      `UPDATE documents SET storage_backend = ?, storage_key = ? WHERE id = ?`,
      [storageBackend, storageKey, file.id]
    );
  } else if (file.table === "contract_documents") {
    run(
      `UPDATE contract_documents SET storage_backend = ?, storage_key = ? WHERE id = ?`,
      [storageBackend, storageKey, file.id]
    );
  } else if (file.table === "contract_invoices") {
    if (file.column === "invoice") {
      run(
        `UPDATE contract_invoices SET invoice_storage_backend = ?, invoice_storage_key = ? WHERE id = ?`,
        [storageBackend, storageKey, file.id]
      );
    } else if (file.column === "payment") {
      run(
        `UPDATE contract_invoices SET payment_storage_backend = ?, payment_storage_key = ? WHERE id = ?`,
        [storageBackend, storageKey, file.id]
      );
    }
  }
}

/**
 * Transfer a file from one S3 bucket to another. Returns the storage key (same path).
 * Non-destructive: source file is not deleted.
 */
async function transferS3File(
  storageKey: string,
  sourceConfig: any,
  targetConfig: any
): Promise<string> {
  const sourceClient = getS3Client(sourceConfig);
  const response = await sourceClient.send(
    new GetObjectCommand({ Bucket: sourceConfig.bucket, Key: storageKey })
  );
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);

  const targetClient = getS3Client(targetConfig);
  await targetClient.send(
    new PutObjectCommand({
      Bucket: targetConfig.bucket,
      Key: storageKey,
      Body: body,
      ContentType: response.ContentType || "application/octet-stream",
      ContentLength: body.length,
    })
  );
  return storageKey;
}

/**
 * Run the storage migration job. Called asynchronously from the API route.
 */
export async function runMigration(jobId: number): Promise<void> {
  try {
    const files = collectFilesToMigrate();

    updateMigrationJob(jobId, {
      status: "running",
      totalFiles: files.length,
      startedAt: new Date().toISOString(),
    });
    saveDb();

    if (files.length === 0) {
      updateMigrationJob(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      saveDb();
      return;
    }

    let migrated = 0;
    let failed = 0;
    let skipped = 0;

    for (const file of files) {
      try {
        // Read local file
        const buffer = await fs.readFile(file.localPath);
        const filename = path.basename(file.localPath);

        // Upload via putFile — handles three-tier routing automatically
        const result = await putFile(file.orgId, file.prefix, filename, buffer, guessContentType(filename));

        if (result.storageBackend !== "local" && result.storageKey) {
          // Successfully uploaded to S3 — update DB record
          updateFileRecord(file, result.storageBackend, result.storageKey);
          migrated++;
        } else {
          // putFile returned local — no S3 configured for this org
          skipped++;
        }
      } catch (err) {
        failed++;
        console.error(`Migration failed for ${file.table}#${file.id} (${file.localPath}):`, err);
      }

      // Update progress after each file
      updateMigrationJob(jobId, { migratedFiles: migrated, failedFiles: failed, skippedFiles: skipped });
      saveDb();
    }

    updateMigrationJob(jobId, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    saveDb();
  } catch (err) {
    console.error("Migration job catastrophic failure:", err);
    updateMigrationJob(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
    saveDb();
  }
}

/**
 * Run a per-org migration job.
 * Supports two directions: local→platform_s3 and own_s3→platform_s3.
 */
export async function runOrgMigration(
  jobId: number,
  orgId: number,
  type: "local_to_platform_s3" | "own_s3_to_platform_s3"
): Promise<void> {
  try {
    if (type === "local_to_platform_s3") {
      const files = collectLocalFilesForOrg(orgId);

      updateMigrationJob(jobId, {
        status: "running",
        totalFiles: files.length,
        startedAt: new Date().toISOString(),
      });
      saveDb();

      if (files.length === 0) {
        updateMigrationJob(jobId, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });
        saveDb();
        return;
      }

      let migrated = 0;
      let failed = 0;
      let skipped = 0;

      for (const file of files) {
        try {
          const buffer = await fs.readFile(file.localPath);
          const filename = path.basename(file.localPath);
          const result = await putFile(file.orgId, file.prefix, filename, buffer, guessContentType(filename));

          if (result.storageBackend !== "local" && result.storageKey) {
            updateFileRecord(file, result.storageBackend, result.storageKey);
            migrated++;
          } else {
            skipped++;
          }
        } catch (err) {
          failed++;
          console.error(`Org migration failed for ${file.table}#${file.id} (${file.localPath}):`, err);
        }

        updateMigrationJob(jobId, { migratedFiles: migrated, failedFiles: failed, skippedFiles: skipped });
        saveDb();
      }

      updateMigrationJob(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      saveDb();
    } else if (type === "own_s3_to_platform_s3") {
      const files = collectOwnS3FilesForOrg(orgId);

      updateMigrationJob(jobId, {
        status: "running",
        totalFiles: files.length,
        startedAt: new Date().toISOString(),
      });
      saveDb();

      if (files.length === 0) {
        updateMigrationJob(jobId, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });
        saveDb();
        return;
      }

      const sourceConfig = getS3Config(orgId);
      if (!sourceConfig) {
        throw new Error(`Org S3 credentials not found for org ${orgId}`);
      }
      const targetConfig = getPlatformS3Config();
      if (!targetConfig) {
        throw new Error("Platform S3 credentials not configured");
      }

      let migrated = 0;
      let failed = 0;
      let skipped = 0;

      for (const file of files) {
        try {
          await transferS3File(file.storageKey, sourceConfig, targetConfig);
          updateFileRecord(file, "platform_s3", file.storageKey);
          migrated++;
        } catch (err) {
          failed++;
          console.error(`Org S3 migration failed for ${file.table}#${file.id} (${file.storageKey}):`, err);
        }

        updateMigrationJob(jobId, { migratedFiles: migrated, failedFiles: failed, skippedFiles: skipped });
        saveDb();
      }

      updateMigrationJob(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      saveDb();
    }
  } catch (err) {
    console.error("Org migration job catastrophic failure:", err);
    updateMigrationJob(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
    saveDb();
  }
}
