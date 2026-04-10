/**
 * Tests for Plan 061 — Conditional Obligation Filter
 * Task 1: Add conditional payment exclusion to the system prompt in lib/contracts.js
 *
 * These are static prompt-content tests. Since we cannot call the live LLM, we verify
 * that the three required edits are present in the system prompt source, and that the
 * old bypass line is absent. This catches future regressions where a prompt edit
 * inadvertently reverts any of the three changes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

const src = readSource("lib/contracts.js");

// ── Change 1: Narrow payments category definition ─────────────────────────────

describe("lib/contracts.js — Change 1: payments category definition (Plan 061)", () => {
  it("payments category includes CERTAIN TO OCCUR qualifier", () => {
    expect(src).toContain('"payments" = payment obligations that are CERTAIN TO OCCUR');
  });

  it("payments category definition lists fixed fees, invoices, scheduled deposits", () => {
    expect(src).toContain("fixed fees, invoices, scheduled deposits");
  });

  it("payments category definition explicitly EXCLUDEs conditional payments", () => {
    expect(src).toContain(
      "EXCLUDE any payment that only materialises if an uncertain triggering event occurs"
    );
  });

  it("payments category mentions reimbursements and contingent bonuses as excluded", () => {
    expect(src).toContain("reimbursements, contingent bonuses");
  });

  it("payments category mentions travel expense refunds as excluded", () => {
    expect(src).toContain('travel expense refunds "if incurred"');
  });

  it("old broad payments definition is no longer present", () => {
    expect(src).not.toContain(
      '"payments" = all payment obligations (fees, invoices, deposits, refunds, penalties that are financial)'
    );
  });
});

// ── Change 2: CONDITIONAL PAYMENT GATE block ─────────────────────────────────

describe("lib/contracts.js — Change 2: CONDITIONAL PAYMENT GATE block (Plan 061)", () => {
  it("CONDITIONAL PAYMENT GATE heading is present", () => {
    expect(src).toContain("CONDITIONAL PAYMENT GATE — applies to ALL payment obligations:");
  });

  it("gate requires payment to be CERTAIN TO OCCUR", () => {
    expect(src).toContain(
      "A payment obligation must be extracted ONLY if the payment is CERTAIN TO OCCUR"
    );
  });

  it("gate blocks expense reimbursements", () => {
    expect(src).toContain(
      'Expense reimbursements ("travel expenses will be reimbursed if incurred"'
    );
  });

  it("gate blocks contingent bonuses", () => {
    expect(src).toContain(
      'Contingent bonuses ("a bonus will be paid if annual targets are met"'
    );
  });

  it("gate blocks commission payments on uncertain deal closure", () => {
    expect(src).toContain(
      'Commission payments ("commissions payable upon successful deal closure"'
    );
  });

  it("gate blocks penalty payments contingent on breach and packs them into penalties field", () => {
    expect(src).toContain(
      "Penalty payments contingent on a breach"
    );
    expect(src).toContain("pack this into the parent obligation's penalties field instead");
  });

  it("gate blocks any payment described with 'if', 'upon', 'provided that'", () => {
    expect(src).toContain(
      'Any payment described with "if", "upon", "provided that", "in the event of", "subject to"'
    );
  });

  it("gate explicitly allows fixed recurring fees", () => {
    expect(src).toContain('Fixed recurring fees ("$5,000/month payable by the 15th" — unconditional)');
  });

  it("gate explicitly allows deposits due at signing", () => {
    expect(src).toContain('Deposits due at signing ("security deposit of $10,000 due upon contract execution")');
  });

  it("gate explicitly allows milestone payments tied to a specific calendar date", () => {
    expect(src).toContain("Milestone payments tied to a specific calendar date");
  });

  it("old bypass line 'This gate does NOT apply to payment obligations' is GONE", () => {
    expect(src).not.toContain(
      "This gate does NOT apply to payment obligations — ALL payment obligations are always extracted per the rules below."
    );
  });
});

// ── Change 3: PAYMENT EXTRACTION heading reinforcement ────────────────────────

describe("lib/contracts.js — Change 3: PAYMENT EXTRACTION heading reinforcement (Plan 061)", () => {
  it("payment extraction heading references the CONDITIONAL PAYMENT GATE", () => {
    expect(src).toContain("Only extract payments that passed the CONDITIONAL PAYMENT GATE above.");
  });

  it("payment extraction heading instructs to skip conditional payments entirely", () => {
    expect(src).toContain(
      "If a payment is conditional on an uncertain future event, skip it entirely — do not create an obligation record for it."
    );
  });

  it("old payment extraction opening line is replaced", () => {
    expect(src).not.toContain(
      "You MUST extract exact payment amounts and dates. A payment obligation with missing amounts or dates is INVALID."
    );
  });

  it("PAYMENT EXTRACTION section still requires non-null amount and date", () => {
    // The INVALID sentence still exists, just combined with the gate reference
    expect(src).toContain("A payment obligation with missing amounts or dates is INVALID.");
  });
});

// ── Structural integrity: prompt is still a valid JS template literal ─────────

describe("lib/contracts.js — structural integrity (Plan 061)", () => {
  it("extractContractTerms is still exported", () => {
    expect(src).toContain("export async function extractContractTerms");
  });

  it("systemPrompt template literal is still present and closed", () => {
    // Count backticks used in the template literal assignment — must be balanced
    const backtickMatches = src.match(/const systemPrompt = `[\s\S]*?`;/);
    expect(backtickMatches).not.toBeNull();
  });

  it("PAYMENT EXTRACTION heading is still present after the gate", () => {
    expect(src).toContain("PAYMENT EXTRACTION — THIS IS THE MOST IMPORTANT RULE:");
  });

  it("NON-PAYMENT OBLIGATION GATE heading is still present and intact", () => {
    expect(src).toContain("NON-PAYMENT OBLIGATION GATE — CRITICAL FILTER:");
  });

  it("CONDITIONAL PAYMENT GATE appears after NON-PAYMENT OBLIGATION GATE in the file", () => {
    const nonPaymentPos = src.indexOf("NON-PAYMENT OBLIGATION GATE — CRITICAL FILTER:");
    const conditionalPos = src.indexOf("CONDITIONAL PAYMENT GATE — applies to ALL payment obligations:");
    const paymentExtractionPos = src.indexOf("PAYMENT EXTRACTION — THIS IS THE MOST IMPORTANT RULE:");
    expect(nonPaymentPos).toBeGreaterThan(-1);
    expect(conditionalPos).toBeGreaterThan(nonPaymentPos);
    expect(paymentExtractionPos).toBeGreaterThan(conditionalPos);
  });
});
