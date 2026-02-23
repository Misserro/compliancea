"use client";

import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PendingReplacementBannerProps {
  documentId: number;
  candidateName: string;
  candidateVersion: number;
  confidence: number;
  onResolved: () => void;
}

export function PendingReplacementBanner({
  documentId,
  candidateName,
  candidateVersion,
  confidence,
  onResolved,
}: PendingReplacementBannerProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/confirm-replacement`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        onResolved();
      } else {
        toast.error(data.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDismiss() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/dismiss-replacement`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.info("Suggestion dismissed");
        onResolved();
      } else {
        toast.error(data.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="flex-1 text-amber-800 dark:text-amber-300">
        May replace <strong>{candidateName}</strong> (v{candidateVersion}){" "}
        <span className="text-amber-600 dark:text-amber-500 text-xs">
          {Math.round(confidence * 100)}% match
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs border-amber-300 hover:bg-amber-100"
        onClick={handleConfirm}
        disabled={loading}
      >
        <Check className="h-3 w-3 mr-1" />
        Confirm
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-amber-700"
        onClick={handleDismiss}
        disabled={loading}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
