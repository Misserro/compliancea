import fs from "fs/promises";
import path from "path";
import { query, run, updateMigrationJob, saveDb } from "@/lib/db-imports";
import { putFile } from "../../lib/storage.js";

interface MigrationFile {
  table: string;
  id: number;
  localPath: string;
  orgId: number;
  prefix: string;
  /** For contract_invoices which have two file columns */
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
 * Update the DB record after successful S3 upload.
 */
function updateFileRecord(file: MigrationFile, storageBackend: string, storageKey: string) {
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

        if (result.storageBackend === "s3" && result.storageKey) {
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
