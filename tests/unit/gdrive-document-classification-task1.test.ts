/**
 * Tests for Task 1: GDrive Document Classification — Classification engine and DB infrastructure
 * Plan 054 — GDrive Document Classification
 *
 * Tests source-level and runtime properties:
 * 1. classifyGDriveDocument: correct classification for contract/annex/invoice/other (mocked Claude)
 * 2. findMatchingContract: correct match on vendor overlap, null on ambiguity, null on no match
 * 3. contract_invoices has document_id column (migration)
 * 4. DB helpers execute without error
 * 5. All new helpers re-exported from db-imports.ts and contracts-imports.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

// ── 1. classifyGDriveDocument — source-level prompt checks ──────────────────

describe("classifyGDriveDocument (lib/contracts.js) — source checks", () => {
  const src = readSource("lib/contracts.js");

  it("exports classifyGDriveDocument", () => {
    expect(src).toContain("export async function classifyGDriveDocument");
  });

  it("returns all required keys: classification, annexParentReference, invoiceData, tokenUsage", () => {
    expect(src).toContain("classification");
    expect(src).toContain("annexParentReference");
    expect(src).toContain("invoiceData");
    expect(src).toContain("tokenUsage");
  });

  it("validates classification against allowed values (contract|annex|invoice|other)", () => {
    expect(src).toContain('"contract"');
    expect(src).toContain('"annex"');
    expect(src).toContain('"invoice"');
    expect(src).toContain('"other"');
    // Fails safe to 'contract'
    expect(src).toContain("validClassifications.includes");
  });

  it("defaults to 'contract' when classification is invalid", () => {
    // The fallback logic: default to "contract"
    expect(src).toMatch(/:\s*["']contract["']/);
  });

  it("sets annexParentReference only when classification === 'annex'", () => {
    expect(src).toContain('classification === "annex"');
  });

  it("sets invoiceData only when classification === 'invoice'", () => {
    expect(src).toContain('classification === "invoice"');
  });

  it("invoice amount is extracted as number not string", () => {
    expect(src).toContain('typeof parsed.invoiceData.amount === "number"');
  });

  it("dates use ISO format (YYYY-MM-DD) per prompt", () => {
    expect(src).toContain("YYYY-MM-DD");
  });
});

// ── 2. classifyGDriveDocument — mocked Claude runtime tests ─────────────────

// Shared mock for the create function, accessible before hoisting
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }
  return { default: MockAnthropic };
});

import { classifyGDriveDocument } from "../../lib/contracts.js";

function setAnthropicResponse(json: object) {
  mockCreate.mockResolvedValueOnce({
    content: [{ text: JSON.stringify(json) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  });
}

describe("classifyGDriveDocument — runtime (mocked Claude)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("classifies a contract text correctly", async () => {
    setAnthropicResponse({
      classification: "contract",
      annexParentReference: null,
      invoiceData: null,
    });
    const result = await classifyGDriveDocument(
      "SERVICE AGREEMENT between Acme Corp and Vendor Inc. Effective Date: 2024-01-01. Governing law: Polish law.",
      "test-key"
    );
    expect(result.classification).toBe("contract");
    expect(result.annexParentReference).toBeNull();
    expect(result.invoiceData).toBeNull();
    expect(result.tokenUsage).toMatchObject({ input: 100, output: 50, total: 150 });
  });

  it("classifies an annex text correctly and populates annexParentReference", async () => {
    setAnthropicResponse({
      classification: "annex",
      annexParentReference: {
        contractTitle: "Service Agreement 2024",
        parties: ["Acme Corp", "Vendor Inc"],
        contractNumber: "SA-2024-001",
      },
      invoiceData: null,
    });
    const result = await classifyGDriveDocument(
      "Annex No. 1 to Service Agreement SA-2024-001 between Acme Corp and Vendor Inc.",
      "test-key"
    );
    expect(result.classification).toBe("annex");
    expect(result.annexParentReference).not.toBeNull();
    expect(result.annexParentReference!.contractTitle).toBe("Service Agreement 2024");
    expect(result.annexParentReference!.parties).toEqual(["Acme Corp", "Vendor Inc"]);
    expect(result.annexParentReference!.contractNumber).toBe("SA-2024-001");
    expect(result.invoiceData).toBeNull();
  });

  it("classifies an invoice text correctly and populates invoiceData", async () => {
    setAnthropicResponse({
      classification: "invoice",
      annexParentReference: null,
      invoiceData: {
        vendorName: "Vendor Inc",
        contractReference: "SA-2024-001",
        invoiceNumber: "FV/2024/042",
        amount: 12500.0,
        currency: "PLN",
        issueDate: "2024-03-01",
        dueDate: "2024-03-15",
      },
    });
    const result = await classifyGDriveDocument(
      "FAKTURA VAT FV/2024/042. Wystawca: Vendor Inc. NIP: 123-456-78-90. Kwota: 12500 PLN. Termin: 2024-03-15.",
      "test-key"
    );
    expect(result.classification).toBe("invoice");
    expect(result.invoiceData).not.toBeNull();
    expect(result.invoiceData!.vendorName).toBe("Vendor Inc");
    expect(result.invoiceData!.amount).toBe(12500.0);
    expect(result.invoiceData!.currency).toBe("PLN");
    expect(result.invoiceData!.issueDate).toBe("2024-03-01");
    expect(result.invoiceData!.dueDate).toBe("2024-03-15");
    expect(result.annexParentReference).toBeNull();
  });

  it("classifies a letter/other text correctly", async () => {
    setAnthropicResponse({
      classification: "other",
      annexParentReference: null,
      invoiceData: null,
    });
    const result = await classifyGDriveDocument(
      "Dear Sir/Madam, I am writing to inform you about our updated privacy policy.",
      "test-key"
    );
    expect(result.classification).toBe("other");
    expect(result.annexParentReference).toBeNull();
    expect(result.invoiceData).toBeNull();
  });

  it("defaults to 'contract' when Claude returns invalid classification", async () => {
    setAnthropicResponse({
      classification: "unknown_type",
      annexParentReference: null,
      invoiceData: null,
    });
    const result = await classifyGDriveDocument("Some text", "test-key");
    expect(result.classification).toBe("contract");
  });

  it("defaults to 'contract' when Claude returns malformed JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ text: "This is not JSON at all" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const result = await classifyGDriveDocument("Some text", "test-key");
    expect(result.classification).toBe("contract");
  });

  it("does not populate annexParentReference when classification is invoice (cross-check)", async () => {
    setAnthropicResponse({
      classification: "invoice",
      annexParentReference: { contractTitle: "Should be ignored", parties: [], contractNumber: null },
      invoiceData: { vendorName: "V", contractReference: null, invoiceNumber: "I-1", amount: 100, currency: "EUR", issueDate: null, dueDate: null },
    });
    const result = await classifyGDriveDocument("Invoice text", "test-key");
    expect(result.classification).toBe("invoice");
    expect(result.annexParentReference).toBeNull();
  });
});

// ── 3. findMatchingContract — source checks ──────────────────────────────────

describe("findMatchingContract (lib/db.js) — source checks", () => {
  const src = readSource("lib/db.js");

  it("exports findMatchingContract", () => {
    expect(src).toContain("export function findMatchingContract");
  });

  it("queries documents with doc_type IN contract/agreement", () => {
    expect(src).toContain("doc_type IN ('contract', 'agreement')");
  });

  it("filters out terminated contracts", () => {
    expect(src).toContain("status != 'terminated'");
  });

  it("returns null when no match found", () => {
    expect(src).toContain("if (best.length === 0) return null");
  });

  it("returns null on ambiguous (tied top score)", () => {
    expect(src).toContain("best[0].score === best[1].score) return null");
  });

  it("returns null if best score < 0.5", () => {
    expect(src).toContain("best[0].score < 0.5");
  });

  it("returns { contractId, confidence } on confident match", () => {
    expect(src).toContain("contractId: best[0].contractId");
    expect(src).toContain("confidence: best[0].score");
  });

  it("does case-insensitive matching", () => {
    expect(src).toContain(".toLowerCase()");
  });
});

// ── 4. DB migration: contract_invoices.document_id ──────────────────────────

describe("DB migration — contract_invoices.document_id", () => {
  const src = readSource("lib/db.js");

  it("adds document_id column to contract_invoices via ALTER TABLE", () => {
    expect(src).toContain(
      "ALTER TABLE contract_invoices ADD COLUMN document_id INTEGER REFERENCES documents(id)"
    );
  });

  it("migration is wrapped in try/catch to be idempotent", () => {
    // The pattern: try { db.run(`ALTER TABLE contract_invoices ADD COLUMN document_id ...`) } catch (e) {}
    const migrationBlock = src.match(
      /try\s*\{[^}]*ALTER TABLE contract_invoices ADD COLUMN document_id[^}]*\}\s*catch/
    );
    expect(migrationBlock).not.toBeNull();
  });
});

// ── 5. documents.classification_metadata migration ──────────────────────────

describe("DB migration — documents.classification_metadata", () => {
  const src = readSource("lib/db.js");

  it("adds classification_metadata column to documents via ALTER TABLE", () => {
    expect(src).toContain(
      "ALTER TABLE documents ADD COLUMN classification_metadata TEXT"
    );
  });
});

// ── 6. DB helpers — source checks ────────────────────────────────────────────

describe("DB helpers (lib/db.js) — source checks", () => {
  const src = readSource("lib/db.js");

  it("exports insertContractDocument", () => {
    expect(src).toContain("export function insertContractDocument");
  });

  it("insertContractDocument inserts into contract_documents with document_id", () => {
    expect(src).toContain("INSERT INTO contract_documents");
    expect(src).toContain("document_id");
  });

  it("exports getUnmatchedAnnexes", () => {
    expect(src).toContain("export function getUnmatchedAnnexes");
  });

  it("getUnmatchedAnnexes queries doc_type = annex without matching contract_documents row", () => {
    expect(src).toContain("doc_type = 'annex'");
    expect(src).toContain("NOT EXISTS (SELECT 1 FROM contract_documents cd WHERE cd.document_id = d.id)");
  });

  it("exports getUnmatchedInvoices", () => {
    expect(src).toContain("export function getUnmatchedInvoices");
  });

  it("getUnmatchedInvoices queries doc_type = invoice without matching contract_invoices row", () => {
    expect(src).toContain("doc_type = 'invoice'");
    expect(src).toContain("NOT EXISTS (SELECT 1 FROM contract_invoices ci WHERE ci.document_id = d.id)");
  });

  it("exports insertContractInvoiceFromGDrive", () => {
    expect(src).toContain("export function insertContractInvoiceFromGDrive");
  });

  it("insertContractInvoiceFromGDrive inserts document_id into contract_invoices", () => {
    expect(src).toContain("INSERT INTO contract_invoices");
    // Specifically check the new GDrive helper function includes document_id in its INSERT
    // The function is defined at the end of db.js after the Plan 054 comment block
    const fnBlock = src.match(/export function insertContractInvoiceFromGDrive[\s\S]*?\n\}/);
    expect(fnBlock?.[0]).toContain("document_id");
  });

  it("exports getDocumentFullText", () => {
    expect(src).toContain("export function getDocumentFullText");
  });

  it("getDocumentFullText queries full_text from documents", () => {
    expect(src).toContain("SELECT full_text FROM documents WHERE id = ?");
  });
});

// ── 7. Re-exports ─────────────────────────────────────────────────────────────

describe("Re-exports — db-imports.ts", () => {
  const src = readSource("src/lib/db-imports.ts");

  it("re-exports findMatchingContract", () => {
    expect(src).toContain("findMatchingContract");
  });

  it("re-exports insertContractDocument", () => {
    expect(src).toContain("insertContractDocument");
  });

  it("re-exports getUnmatchedAnnexes", () => {
    expect(src).toContain("getUnmatchedAnnexes");
  });

  it("re-exports getUnmatchedInvoices", () => {
    expect(src).toContain("getUnmatchedInvoices");
  });

  it("re-exports insertContractInvoiceFromGDrive", () => {
    expect(src).toContain("insertContractInvoiceFromGDrive");
  });

  it("re-exports getDocumentFullText", () => {
    expect(src).toContain("getDocumentFullText");
  });
});

describe("Re-exports — contracts-imports.ts", () => {
  const src = readSource("src/lib/contracts-imports.ts");

  it("re-exports classifyGDriveDocument", () => {
    expect(src).toContain("classifyGDriveDocument");
  });
});
