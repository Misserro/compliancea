"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEPARTMENTS, OBLIGATION_CATEGORIES, CONTRACT_STATUS_DISPLAY } from "@/lib/constants";

interface ObligationDraft {
  key: string;
  title: string;
  obligationType: string;
  description: string;
  clauseReference: string;
  dueDate: string;
  recurrence: string;
  noticePeriodDays: string;
  owner: string;
  escalationTo: string;
  category: string;
  department: string;
  summary: string;
  activation: string;
  penalties: string;
  proofDescription: string;
}

function makeObligation(): ObligationDraft {
  return {
    key: crypto.randomUUID(),
    title: "",
    obligationType: "",
    description: "",
    clauseReference: "",
    dueDate: "",
    recurrence: "",
    noticePeriodDays: "",
    owner: "",
    escalationTo: "",
    category: "",
    department: "",
    summary: "",
    activation: "",
    penalties: "",
    proofDescription: "",
  };
}

interface ObligationFormCardProps {
  obligation: ObligationDraft;
  onChange: (key: string, field: string, value: string) => void;
  onRemove: (key: string) => void;
}

function ObligationFormCard({ obligation, onChange, onRemove }: ObligationFormCardProps) {
  const field = (label: string, name: keyof ObligationDraft, type: "text" | "date" | "number" | "textarea" | "select", options?: readonly string[]) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {type === "textarea" ? (
        <textarea
          className="w-full border border-input rounded px-3 py-2 text-sm min-h-[80px] bg-background"
          value={obligation[name]}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
        />
      ) : type === "select" && options ? (
        <select
          className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
          value={obligation[name]}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
        >
          <option value="">— select —</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
          value={obligation[name]}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
        />
      )}
    </div>
  );

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{obligation.title || "New Obligation"}</CardTitle>
        <button
          type="button"
          onClick={() => onRemove(obligation.key)}
          className="text-muted-foreground hover:text-destructive transition-colors text-lg leading-none"
          aria-label="Remove obligation"
        >
          ✕
        </button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {field("Title *", "title", "text")}
        {field("Type", "obligationType", "text")}
        {field("Clause reference", "clauseReference", "text")}
        {field("Due date", "dueDate", "date")}
        {field("Recurrence", "recurrence", "text")}
        {field("Notice period (days)", "noticePeriodDays", "number")}
        {field("Owner", "owner", "text")}
        {field("Escalation to", "escalationTo", "text")}
        {field("Activation", "activation", "text")}
        {field("Category", "category", "select", OBLIGATION_CATEGORIES)}
        {field("Department", "department", "select", DEPARTMENTS)}
        {field("Description", "description", "textarea")}
        {field("Summary", "summary", "textarea")}
        {field("Penalties", "penalties", "textarea")}
        {field("Proof description", "proofDescription", "textarea")}
      </CardContent>
    </Card>
  );
}

export function ContractsNewForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  const [loadError, setLoadError] = useState<string | null>(null);
  const [contractName, setContractName] = useState("");
  const [contractingCompany, setContractingCompany] = useState("");
  const [contractingVendor, setContractingVendor] = useState("");
  const [signatureDate, setSignatureDate] = useState("");
  const [commencementDate, setCommencementDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("unsigned");
  const [obligations, setObligations] = useState<ObligationDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoadError("Missing document ID.");
      return;
    }
    fetch(`/api/documents/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.document) {
          setContractName(data.document.name || "");
        } else {
          setLoadError("Document not found.");
        }
      })
      .catch(() => setLoadError("Failed to load document."));
  }, [id]);

  const handleObligationChange = (key: string, field: string, value: string) => {
    setObligations((prev) =>
      prev.map((ob) => (ob.key === key ? { ...ob, [field]: value } : ob))
    );
  };

  const handleSave = async () => {
    setNameError(null);
    setSaveError(null);
    if (!contractName.trim()) {
      setNameError("Contract name is required.");
      return;
    }
    setSaving(true);
    try {
      // PATCH contract metadata
      const patchRes = await fetch(`/api/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contractName,
          contracting_company: contractingCompany,
          contracting_vendor: contractingVendor,
          signature_date: signatureDate,
          commencement_date: commencementDate,
          expiry_date: expiryDate,
          category,
          status,
          doc_type: "contract",
        }),
      });
      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save contract.");
      }
      const patchData = await patchRes.json();
      if (!patchData.contract) {
        throw new Error("Contract was not saved correctly. Please try again.");
      }
      // POST obligations sequentially
      for (const ob of obligations) {
        const { key: _key, ...obData } = ob;
        const noticePeriodDaysParsed = parseInt(obData.noticePeriodDays, 10);
        const noticePeriodDays = isNaN(noticePeriodDaysParsed) ? null : noticePeriodDaysParsed;
        const obRes = await fetch(`/api/documents/${id}/obligations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...obData, noticePeriodDays }),
        });
        if (!obRes.ok) {
          const errData = await obRes.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to save obligation "${ob.title}".`);
        }
      }
      setSaving(false);
      router.push("/contracts");
    } catch (err: unknown) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : "An error occurred.");
    }
  };

  if (loadError) {
    return (
      <div className="p-6 text-sm text-destructive">
        <p>{loadError}</p>
        <a href="/contracts" className="underline text-muted-foreground mt-2 inline-block">
          Back to contracts
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Add Contract Manually</h2>

      <Card>
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Contract name *</label>
            <input
              type="text"
              className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
            />
            {nameError && <p className="text-destructive text-xs mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contracting company</label>
            <input type="text" className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={contractingCompany} onChange={(e) => setContractingCompany(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contracting vendor</label>
            <input type="text" className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={contractingVendor} onChange={(e) => setContractingVendor(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Signature date</label>
            <input type="date" className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={signatureDate} onChange={(e) => setSignatureDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Commencement date</label>
            <input type="date" className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={commencementDate} onChange={(e) => setCommencementDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expiry date</label>
            <input type="date" className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— select —</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(CONTRACT_STATUS_DISPLAY).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-4">Obligations</h3>
        {obligations.map((ob) => (
          <ObligationFormCard
            key={ob.key}
            obligation={ob}
            onChange={handleObligationChange}
            onRemove={(key) => setObligations((prev) => prev.filter((o) => o.key !== key))}
          />
        ))}
        <button
          type="button"
          onClick={() => setObligations((prev) => [...prev, makeObligation()])}
          className="px-4 py-2 border border-input rounded text-sm font-medium hover:bg-accent transition-colors"
        >
          + Add Obligation
        </button>
      </div>

      {saveError && <p className="text-destructive text-sm">{saveError}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save Contract"}
      </button>
    </div>
  );
}
