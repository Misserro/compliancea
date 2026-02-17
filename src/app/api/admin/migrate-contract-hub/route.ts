import { NextResponse } from "next/server";
import {
  getAllObligations,
  updateObligation,
  getAllDocuments,
  createSystemObligation,
  query,
  run,
} from "@/lib/db-imports";
import { CATEGORY_MIGRATION_MAP } from "@/lib/constants";
import type { Document } from "@/lib/types";

/**
 * POST /api/admin/migrate-contract-hub
 * Migrate existing data to Contract Hub structure
 */
export async function POST() {
  try {
    const results = {
      migratedObligations: 0,
      systemObligationsCreated: 0,
      errors: [] as string[],
    };

    // Step 1: Create backup table
    try {
      await run(
        `CREATE TABLE IF NOT EXISTS contract_obligations_backup_${Date.now()} AS SELECT * FROM contract_obligations`,
        []
      );
    } catch (err) {
      results.errors.push(`Backup failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    // Step 2: Migrate obligation categories
    const obligations = await getAllObligations();
    for (const obligation of obligations) {
      if (obligation.category) {
        const newCategory = CATEGORY_MIGRATION_MAP[obligation.category];
        if (newCategory && newCategory !== obligation.category) {
          try {
            await updateObligation(obligation.id, { category: newCategory });
            results.migratedObligations++;
          } catch (err) {
            results.errors.push(
              `Failed to migrate obligation ${obligation.id}: ${err instanceof Error ? err.message : "Unknown"}`
            );
          }
        }
      }
    }

    // Step 3: Create system obligations for unsigned/signed contracts
    const documents = await getAllDocuments();
    const contracts = documents.filter(
      (doc: Document) =>
        (doc.doc_type === "contract" || doc.doc_type === "agreement") &&
        (doc.status === "unsigned" || doc.status === "signed")
    );

    for (const contract of contracts) {
      try {
        // Check if system obligation already exists
        const existing = await query(
          `SELECT id FROM contract_obligations WHERE document_id = ? AND obligation_type = 'system_sign'`,
          [contract.id]
        );

        if (existing.length === 0) {
          await createSystemObligation(contract.id, "system_sign");
          results.systemObligationsCreated++;
        }
      } catch (err) {
        results.errors.push(
          `Failed to create system obligation for contract ${contract.id}: ${
            err instanceof Error ? err.message : "Unknown"
          }`
        );
      }
    }

    // Step 4: Set default departments (best effort based on owner field)
    // This is optional and can be refined based on your data
    try {
      const departmentMap: Record<string, string> = {
        // Add your owner -> department mappings here
        // Example: "John Doe": "Finance",
      };

      for (const [owner, department] of Object.entries(departmentMap)) {
        await run(
          `UPDATE contract_obligations SET department = ? WHERE owner = ? AND department IS NULL`,
          [department, owner]
        );
      }
    } catch (err) {
      results.errors.push(`Department mapping failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `Migration completed. Migrated ${results.migratedObligations} obligations, created ${results.systemObligationsCreated} system obligations.`,
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Migration failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
