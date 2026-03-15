"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DEPARTMENTS } from "@/lib/constants";

interface AddContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = "upload" | "uploading-manual" | "processing" | "done" | "error-upload" | "error-process";

export function AddContractDialog({ open, onOpenChange, onSuccess }: AddContractDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [obligationsCount, setObligationsCount] = useState(0);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const reset = () => {
    setStep("upload");
    setFile(null);
    setCategory("");
    setError("");
    setObligationsCount(0);
    setDocumentId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setIsSubmitting(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClose = () => {
    if (step === "processing" || step === "uploading-manual") return; // cannot dismiss during processing
    reset();
    onOpenChange(false);
  };

  const handleProcess = async (docId: number) => {
    try {
      const res = await fetch(`/api/documents/${docId}/process`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Processing failed");

      const count: number = data.contract?.obligations?.length ?? 0;
      setObligationsCount(count);
      setStep("done");
      timerRef.current = setTimeout(() => {
        reset();
        onSuccess();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
      setStep("error-process");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    if (category) formData.append("category", category);

    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const docId: number = data.document.id;
      setDocumentId(docId);
      setStep("processing");
      await handleProcess(docId);
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("error-upload");
    }
  };

  const handleUploadManual = async () => {
    if (!file || isSubmitting) return;
    setIsSubmitting(true);
    setStep("uploading-manual");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Upload failed");
      }
      const data = await response.json();
      const docId = data.document?.id;
      reset();
      onOpenChange(false);
      router.push(`/contracts/new?id=${docId}`);
    } catch (err: unknown) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("error-upload");
    }
  };

  const handleRetryProcess = async () => {
    if (!documentId) return;
    setError("");
    setStep("processing");
    await handleProcess(documentId);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Add New Contract</h2>
          {step !== "processing" && step !== "uploading-manual" && (
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Step 1: Upload */}
        {(step === "upload" || step === "error-upload") && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Contract Document</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted file:text-foreground hover:file:bg-muted/80"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground mt-1">PDF or DOCX, max 10 MB</p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Category <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <select
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select category…</option>
                {DEPARTMENTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadManual}
                disabled={!file || isSubmitting}
                className="px-4 py-2 border border-input rounded text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add manually
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || isSubmitting}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add with AI
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === "processing" && (
          <div className="py-10 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Processing contract…</p>
            <p className="text-xs text-muted-foreground mt-1">This may take a moment.</p>
          </div>
        )}

        {/* Step: Uploading manual */}
        {step === "uploading-manual" && (
          <div className="py-10 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Uploading contract…</p>
            <p className="text-xs text-muted-foreground mt-1">This may take a moment.</p>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              Contract added — {obligationsCount} obligation{obligationsCount !== 1 ? "s" : ""} extracted
            </p>
            <p className="text-xs text-muted-foreground mt-1">Closing…</p>
          </div>
        )}

        {/* Error: processing failed (document already uploaded) */}
        {step === "error-process" && (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRetryProcess}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                Retry Processing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
