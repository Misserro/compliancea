"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEPARTMENTS, OBLIGATION_CATEGORIES, CONTRACT_STATUS_DISPLAY, CONTRACT_TYPES, INVOICE_CURRENCIES, REPORTING_FREQUENCIES } from "@/lib/constants";

interface ObligationDraft {
  key: string;
  title: string;
  description: string;
  clauseReference: string;
  dueDate: string;
  startDate: string;
  isRepeating: boolean;
  recurrenceInterval: string;
  owner: string;
  escalationTo: string;
  category: string;
  department: string;
  summary: string;
  proofDescription: string;
  paymentAmount: string;
  paymentCurrency: string;
  reportingFrequency: string;
  reportingRecipient: string;
  complianceRegulatoryBody: string;
  complianceJurisdiction: string;
  operationalServiceType: string;
  operationalSlaMetric: string;
}

function makeObligation(): ObligationDraft {
  return {
    key: crypto.randomUUID(),
    title: "",
    description: "",
    clauseReference: "",
    dueDate: "",
    startDate: "",
    isRepeating: false,
    recurrenceInterval: "",
    owner: "",
    escalationTo: "",
    category: "payment",
    department: "",
    summary: "",
    proofDescription: "",
    paymentAmount: "",
    paymentCurrency: "EUR",
    reportingFrequency: "",
    reportingRecipient: "",
    complianceRegulatoryBody: "",
    complianceJurisdiction: "",
    operationalServiceType: "",
    operationalSlaMetric: "",
  };
}

interface ObligationFormCardProps {
  obligation: ObligationDraft;
  onChange: (key: string, field: keyof ObligationDraft, value: string | boolean) => void;
  onRemove: (key: string) => void;
}

function ObligationFormCard({ obligation, onChange, onRemove }: ObligationFormCardProps) {
  const field = (label: string, name: keyof ObligationDraft, type: "text" | "date" | "number" | "textarea" | "select", options?: readonly string[]) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {type === "textarea" ? (
        <textarea
          className="w-full border border-input rounded px-3 py-2 text-sm min-h-[80px] bg-background"
          value={obligation[name] as string}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
        />
      ) : type === "select" && options ? (
        <select
          className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
          value={obligation[name] as string}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
        >
          <option value="">-- select --</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
          value={obligation[name] as string}
          onChange={(e) => onChange(obligation.key, name, e.target.value)}
        />
      )}
    </div>
  );

  const categorySpecificFields = () => {
    switch (obligation.category) {
      case "payment":
        return (
          <>
            {field("Amount", "paymentAmount", "number")}
            {field("Currency", "paymentCurrency", "select", INVOICE_CURRENCIES)}
          </>
        );
      case "reporting":
        return (
          <>
            {field("Frequency", "reportingFrequency", "select", REPORTING_FREQUENCIES)}
            {field("Recipient", "reportingRecipient", "text")}
          </>
        );
      case "compliance":
        return (
          <>
            {field("Regulatory body", "complianceRegulatoryBody", "text")}
            {field("Jurisdiction", "complianceJurisdiction", "text")}
          </>
        );
      case "operational":
        return (
          <>
            {field("Service type", "operationalServiceType", "text")}
            {field("SLA metric", "operationalSlaMetric", "text")}
          </>
        );
      default:
        return null;
    }
  };

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
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Category *</label>
          <select
            className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
            value={obligation.category}
            onChange={(e) => onChange(obligation.key, "category", e.target.value)}
          >
            {OBLIGATION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
            ))}
          </select>
        </div>
        {field("Title *", "title", "text")}
        {field("Due date", "dueDate", "date")}
        {field("Start date", "startDate", "date")}
        {field("Owner", "owner", "text")}
        {field("Description", "description", "textarea")}
        {obligation.category && categorySpecificFields()}
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={obligation.isRepeating}
              onChange={(e) => onChange(obligation.key, "isRepeating", e.target.checked)}
              className="rounded border-input"
            />
            Repeating?
          </label>
        </div>
        {obligation.isRepeating && (
          <div>
            <label className="block text-sm font-medium mb-1">Repeat every</label>
            <select
              className="w-full border border-input rounded px-3 py-2 text-sm bg-background"
              value={obligation.recurrenceInterval}
              onChange={(e) => onChange(obligation.key, "recurrenceInterval", e.target.value)}
            >
              <option value="">-- select --</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">365 days</option>
            </select>
          </div>
        )}
        {field("Department", "department", "select", DEPARTMENTS)}
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
  const [contractType, setContractType] = useState("");
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

  const handleObligationChange = (key: string, field: keyof ObligationDraft, value: string | boolean) => {
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
    if (!id) {
      setSaveError("Missing document ID.");
      return;
    }
    for (const ob of obligations) {
      if (ob.isRepeating && !ob.recurrenceInterval) {
        setSaveError(`Obligation "${ob.title || "New Obligation"}": please select a repeat interval.`);
        return;
      }
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
          contract_type: contractType || undefined,
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key: _key, isRepeating, recurrenceInterval, paymentAmount, ...obData } = ob;
        const recurrenceIntervalParsed = parseInt(recurrenceInterval, 10);
        const finalRecurrenceInterval = !isRepeating ? null : (isNaN(recurrenceIntervalParsed) ? null : recurrenceIntervalParsed);
        const parsedPaymentAmount = parseFloat(paymentAmount);
        const finalPaymentAmount = isNaN(parsedPaymentAmount) ? null : parsedPaymentAmount;

        const obRes = await fetch(`/api/documents/${id}/obligations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...obData,
            isRepeating,
            recurrenceInterval: finalRecurrenceInterval,
            paymentAmount: finalPaymentAmount,
          }),
        });
        if (!obRes.ok) {
          const errData = await obRes.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to save obligation "${ob.title}".`);
        }
      }
      setSaving(false);
      router.push("/contracts/list");
    } catch (err: unknown) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : "An error occurred.");
    }
  };

  if (loadError) {
    return (
      <div className="p-6 text-sm text-destructive">
        <p>{loadError}</p>
        <Link href="/contracts/list" className="underline text-muted-foreground mt-2 inline-block">
          Back to contracts
        </Link>
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
            <label className="block text-sm font-medium mb-1">Contract type</label>
            <select className="w-full border border-input rounded px-3 py-2 text-sm bg-background" value={contractType} onChange={(e) => setContractType(e.target.value)}>
              <option value="">-- select --</option>
              {CONTRACT_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
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
              <option value="">-- select --</option>
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
        {saving ? "Saving..." : "Save Contract"}
      </button>
    </div>
  );
}
