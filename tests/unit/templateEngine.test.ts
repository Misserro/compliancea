/**
 * Unit tests for lib/templateEngine.js
 * Tests against Task 4 success criteria from plan 022-legal-hub.
 */
import { describe, it, expect, beforeEach } from "vitest";
// @ts-ignore — .js file without matching .d.ts visible to vitest
import { fillTemplate } from "../../lib/templateEngine.js";

// Minimal case data matching legal_cases schema
const baseCaseData = {
  id: 42,
  reference_number: "I C 123/2025",
  internal_number: "INT-001",
  title: "Test Case Title",
  case_type: "civil",
  court: "Sąd Rejonowy w Warszawie",
  court_division: "Wydział I Cywilny",
  judge: "SSR Jan Kowalski",
  status: "active",
  summary: "Case summary text",
  claim_description: "Claim about damages",
  claim_value: 5000,
  claim_currency: "PLN",
};

const basePlaintiff = {
  id: 1,
  case_id: 42,
  party_type: "plaintiff",
  name: "Anna Nowak",
  address: "ul. Kwiatowa 1, Warszawa",
  representative_name: "adw. Marek Lis",
  representative_address: "ul. Prawnicza 5, Warszawa",
  representative_type: "attorney",
};

const baseDefendant = {
  id: 2,
  case_id: 42,
  party_type: "defendant",
  name: "Firma XYZ Sp. z o.o.",
  address: "ul. Biznesowa 10, Kraków",
  representative_name: null,
  representative_address: null,
  representative_type: null,
};

const baseParties = [basePlaintiff, baseDefendant];

const basePendingDeadline = {
  id: 1,
  case_id: 42,
  title: "Rozprawa główna",
  deadline_type: "hearing",
  due_date: "2025-06-15",
  status: "pending",
};

const baseDeadlines = [basePendingDeadline];

// ---- Happy path: variable resolution ----

describe("fillTemplate — case.* variable resolution", () => {
  it("resolves {{case.reference_number}}", () => {
    const { html, snapshot } = fillTemplate(
      "<p>Sygnatura: {{case.reference_number}}</p>",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toContain("I C 123/2025");
    expect(snapshot["case.reference_number"]).toBe("I C 123/2025");
  });

  it("resolves {{case.court}}", () => {
    const { html, snapshot } = fillTemplate(
      "<p>Sąd: {{case.court}}</p>",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toContain("Sąd Rejonowy w Warszawie");
    expect(snapshot["case.court"]).toBe("Sąd Rejonowy w Warszawie");
  });

  it("resolves {{case.title}}", () => {
    const { html } = fillTemplate(
      "{{case.title}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Test Case Title");
  });

  it("resolves {{case.claim_value}} (numeric field)", () => {
    const { html, snapshot } = fillTemplate(
      "Wartość: {{case.claim_value}} {{case.claim_currency}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Wartość: 5000 PLN");
    expect(snapshot["case.claim_value"]).toBe("5000");
  });
});

describe("fillTemplate — parties.plaintiff.* variable resolution", () => {
  it("resolves {{parties.plaintiff.name}}", () => {
    const { html, snapshot } = fillTemplate(
      "Powód: {{parties.plaintiff.name}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Powód: Anna Nowak");
    expect(snapshot["parties.plaintiff.name"]).toBe("Anna Nowak");
  });

  it("resolves {{parties.plaintiff.address}}", () => {
    const { html } = fillTemplate(
      "Adres: {{parties.plaintiff.address}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Adres: ul. Kwiatowa 1, Warszawa");
  });
});

describe("fillTemplate — parties.defendant.* variable resolution", () => {
  it("resolves {{parties.defendant.name}}", () => {
    const { html, snapshot } = fillTemplate(
      "Pozwany: {{parties.defendant.name}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Pozwany: Firma XYZ Sp. z o.o.");
    expect(snapshot["parties.defendant.name"]).toBe("Firma XYZ Sp. z o.o.");
  });
});

describe("fillTemplate — parties.representative.* variable resolution", () => {
  it("resolves {{parties.representative.representative_name}} from plaintiff", () => {
    const { html, snapshot } = fillTemplate(
      "Pełnomocnik: {{parties.representative.representative_name}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Pełnomocnik: adw. Marek Lis");
    expect(snapshot["parties.representative.representative_name"]).toBe("adw. Marek Lis");
  });
});

describe("fillTemplate — deadlines.next.* variable resolution", () => {
  it("resolves {{deadlines.next.title}} for nearest pending deadline", () => {
    const { html, snapshot } = fillTemplate(
      "Termin: {{deadlines.next.title}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Termin: Rozprawa główna");
    expect(snapshot["deadlines.next.title"]).toBe("Rozprawa główna");
  });

  it("resolves {{deadlines.next.due_date}}", () => {
    const { html } = fillTemplate(
      "Data: {{deadlines.next.due_date}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Data: 2025-06-15");
  });

  it("picks the nearest pending deadline when multiple exist", () => {
    const deadlines = [
      { ...basePendingDeadline, id: 2, title: "Later deadline", due_date: "2025-09-01", status: "pending" },
      { ...basePendingDeadline, id: 1, title: "Earlier deadline", due_date: "2025-06-01", status: "pending" },
    ];
    const { html } = fillTemplate(
      "{{deadlines.next.title}}",
      baseCaseData,
      baseParties,
      deadlines
    );
    expect(html).toBe("Earlier deadline");
  });

  it("ignores non-pending deadlines when finding next", () => {
    const deadlines = [
      { ...basePendingDeadline, id: 1, title: "Met deadline", due_date: "2025-01-01", status: "met" },
      { ...basePendingDeadline, id: 2, title: "Pending far", due_date: "2025-12-01", status: "pending" },
    ];
    const { html } = fillTemplate(
      "{{deadlines.next.title}}",
      baseCaseData,
      baseParties,
      deadlines
    );
    expect(html).toBe("Pending far");
  });
});

describe("fillTemplate — today", () => {
  it("resolves {{today}} as a non-empty string", () => {
    const { html, snapshot } = fillTemplate(
      "Data: {{today}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).not.toContain("{{today}}");
    expect(html).not.toContain("[brak danych");
    expect(snapshot["today"]).toBeTruthy();
  });
});

// ---- Critical: missing variable fallback ----

describe("fillTemplate — missing variable fallback (CRITICAL CRITERION)", () => {
  it("renders [brak danych: parties.plaintiff.name] when no plaintiff exists", () => {
    const { html, snapshot } = fillTemplate(
      "Powód: {{parties.plaintiff.name}}",
      baseCaseData,
      [], // no parties
      baseDeadlines
    );
    expect(html).toBe("Powód: [brak danych: parties.plaintiff.name]");
    expect(snapshot["parties.plaintiff.name"]).toBe("[brak danych]");
  });

  it("renders [brak danych: case.reference_number] when field is null", () => {
    const caseWithNullRef = { ...baseCaseData, reference_number: null };
    const { html, snapshot } = fillTemplate(
      "Ref: {{case.reference_number}}",
      caseWithNullRef,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("Ref: [brak danych: case.reference_number]");
    expect(snapshot["case.reference_number"]).toBe("[brak danych]");
  });

  it("renders [brak danych: case.reference_number] when field is undefined", () => {
    const caseWithoutRef = { ...baseCaseData };
    delete (caseWithoutRef as any).reference_number;
    const { html } = fillTemplate(
      "{{case.reference_number}}",
      caseWithoutRef,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("[brak danych: case.reference_number]");
  });

  it("renders [brak danych: deadlines.next.title] when no pending deadlines", () => {
    const { html, snapshot } = fillTemplate(
      "{{deadlines.next.title}}",
      baseCaseData,
      baseParties,
      [] // no deadlines
    );
    expect(html).toBe("[brak danych: deadlines.next.title]");
    expect(snapshot["deadlines.next.title"]).toBe("[brak danych]");
  });

  it("renders [brak danych: unknown.variable] for completely unrecognized source", () => {
    const { html } = fillTemplate(
      "{{unknown.variable}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(html).toBe("[brak danych: unknown.variable]");
  });

  it("does NOT render blank — always produces the fallback string, not empty", () => {
    const { html } = fillTemplate(
      "X{{parties.defendant.name}}Y",
      baseCaseData,
      [], // no parties
      baseDeadlines
    );
    // Must not be "XY" (blank substitution)
    expect(html).not.toBe("XY");
    // Must be the fallback
    expect(html).toBe("X[brak danych: parties.defendant.name]Y");
  });
});

// ---- snapshot is a value copy, not live references ----

describe("fillTemplate — filled_variables_json is a value snapshot", () => {
  it("snapshot records resolved string values at generation time", () => {
    const { snapshot } = fillTemplate(
      "{{case.reference_number}} {{parties.plaintiff.name}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(typeof snapshot["case.reference_number"]).toBe("string");
    expect(typeof snapshot["parties.plaintiff.name"]).toBe("string");
    expect(snapshot["case.reference_number"]).toBe("I C 123/2025");
    expect(snapshot["parties.plaintiff.name"]).toBe("Anna Nowak");
  });

  it("snapshot does not change when source data is mutated after fillTemplate call", () => {
    const mutableCase = { ...baseCaseData };
    const { snapshot } = fillTemplate(
      "{{case.reference_number}}",
      mutableCase,
      baseParties,
      baseDeadlines
    );
    // Mutate source — snapshot must remain unchanged
    mutableCase.reference_number = "CHANGED";
    expect(snapshot["case.reference_number"]).toBe("I C 123/2025");
  });

  it("snapshot keys match the token names used in the template", () => {
    const { snapshot } = fillTemplate(
      "{{case.court}} {{parties.plaintiff.name}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    expect(Object.keys(snapshot)).toContain("case.court");
    expect(Object.keys(snapshot)).toContain("parties.plaintiff.name");
  });

  it("snapshot only contains tokens that appear in the template", () => {
    const { snapshot } = fillTemplate(
      "{{case.court}}",
      baseCaseData,
      baseParties,
      baseDeadlines
    );
    // Should only have the one token used
    expect(Object.keys(snapshot)).toHaveLength(1);
    expect(Object.keys(snapshot)).toContain("case.court");
  });
});

// ---- Multiple placeholders in one template ----

describe("fillTemplate — multiple placeholders", () => {
  it("resolves all three required placeholders in one template", () => {
    const body = "{{case.reference_number}} / {{parties.plaintiff.name}} / {{case.court}}";
    const { html, snapshot } = fillTemplate(body, baseCaseData, baseParties, baseDeadlines);
    expect(html).toBe("I C 123/2025 / Anna Nowak / Sąd Rejonowy w Warszawie");
    expect(snapshot["case.reference_number"]).toBe("I C 123/2025");
    expect(snapshot["parties.plaintiff.name"]).toBe("Anna Nowak");
    expect(snapshot["case.court"]).toBe("Sąd Rejonowy w Warszawie");
  });

  it("handles a mix of resolved and missing variables in the same template", () => {
    const body = "{{case.reference_number}} {{parties.plaintiff.name}}";
    const { html } = fillTemplate(body, baseCaseData, [], baseDeadlines);
    expect(html).toBe("I C 123/2025 [brak danych: parties.plaintiff.name]");
  });
});

// ---- Edge cases ----

describe("fillTemplate — edge cases", () => {
  it("returns original HTML unchanged when no placeholders are present", () => {
    const body = "<p>Static text only.</p>";
    const { html, snapshot } = fillTemplate(body, baseCaseData, baseParties, baseDeadlines);
    expect(html).toBe(body);
    expect(Object.keys(snapshot)).toHaveLength(0);
  });

  it("handles empty template body", () => {
    const { html, snapshot } = fillTemplate("", baseCaseData, baseParties, baseDeadlines);
    expect(html).toBe("");
    expect(Object.keys(snapshot)).toHaveLength(0);
  });

  it("handles null parties array gracefully", () => {
    expect(() =>
      fillTemplate("{{parties.plaintiff.name}}", baseCaseData, null as any, baseDeadlines)
    ).not.toThrow();
    const { html } = fillTemplate("{{parties.plaintiff.name}}", baseCaseData, null as any, baseDeadlines);
    expect(html).toBe("[brak danych: parties.plaintiff.name]");
  });

  it("handles null deadlines array gracefully", () => {
    expect(() =>
      fillTemplate("{{deadlines.next.title}}", baseCaseData, baseParties, null as any)
    ).not.toThrow();
    const { html } = fillTemplate("{{deadlines.next.title}}", baseCaseData, baseParties, null as any);
    expect(html).toBe("[brak danych: deadlines.next.title]");
  });

  it("handles a deeply nested case field that doesn't exist", () => {
    const { html } = fillTemplate("{{case.nonexistent_field}}", baseCaseData, baseParties, baseDeadlines);
    expect(html).toBe("[brak danych: case.nonexistent_field]");
  });
});
