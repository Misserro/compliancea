"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import { LEGAL_CASE_TYPES, LEGAL_CASE_TYPE_LABELS } from "@/lib/constants";
import type { OrgMember } from "@/lib/types";

interface NewCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NewCaseDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewCaseDialogProps) {
  const { data: sessionData } = useSession();
  const isAdmin = sessionData?.user?.orgRole !== "member";
  const currentUserId = sessionData?.user?.id;

  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [court, setCourt] = useState("");
  const [summary, setSummary] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch org members for admin assignee picker
  useEffect(() => {
    if (open && isAdmin) {
      fetch("/api/org/members")
        .then((res) => res.json())
        .then((data) => {
          if (data.members) {
            setMembers(data.members);
            // Default to current user if not already set
            if (!assignedTo && currentUserId) {
              setAssignedTo(String(currentUserId));
            }
          }
        })
        .catch(() => {
          // Silently fail — admin can still create without picker
        });
    }
  }, [open, isAdmin, currentUserId]); // assignedTo intentionally excluded — default-selection runs once on open

  const reset = () => {
    setTitle("");
    setCaseType("");
    setReferenceNumber("");
    setCourt("");
    setSummary("");
    setAssignedTo("");
    setMembers([]);
    setError("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!caseType) {
      setError("Case type is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        case_type: caseType,
        reference_number: referenceNumber.trim() || null,
        court: court.trim() || null,
        summary: summary.trim() || null,
      };
      if (isAdmin && assignedTo) {
        body.assigned_to = Number(assignedTo);
      }

      const res = await fetch("/api/legal-hub/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create case");
        setIsSubmitting(false);
        return;
      }

      reset();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create case");
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New Case</h2>
          {!isSubmitting && (
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Case title"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Case Type <span className="text-destructive">*</span>
            </label>
            <select
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
            >
              <option value="">Select case type...</option>
              {LEGAL_CASE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEGAL_CASE_TYPE_LABELS[t] || t}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && members.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Przypisany do
              </label>
              <select
                className="w-full px-2 py-1.5 border rounded text-sm bg-background"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.user_id} value={String(m.user_id)}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Reference Number{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. I C 123/26"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Court{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="e.g. District Court in Warsaw"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Summary{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              className="w-full px-2 py-1.5 border rounded text-sm bg-background resize-none"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description of the case"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Creating..." : "Create Case"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
