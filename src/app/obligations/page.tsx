"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ObligationsStatsBar } from "@/components/obligations/obligations-stats";
import { ObligationCard } from "@/components/obligations/obligation-card";
import { EvidenceDialog } from "@/components/obligations/evidence-dialog";
import type { Obligation, ObligationStats } from "@/lib/types";

export default function ObligationsPage() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [stats, setStats] = useState<ObligationStats | null>(null);
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);

  // Evidence dialog
  const [evidenceObId, setEvidenceObId] = useState<number | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const loadObligations = useCallback(async () => {
    try {
      const res = await fetch(`/api/obligations?filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setObligations(data.obligations || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      toast.error(`Failed to load obligations: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadObligations();
  }, [loadObligations]);

  async function handleUpdateField(id: number, field: string, value: string) {
    try {
      const res = await fetch(`/api/obligations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setObligations((prev) =>
          prev.map((ob) => (ob.id === id ? data.obligation : ob))
        );
        if (field === "status") {
          await loadObligations();
        }
      }
    } catch (err) {
      toast.error(`Update failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleRemoveEvidence(obId: number, index: number) {
    try {
      const res = await fetch(`/api/obligations/${obId}/evidence/${index}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        setObligations((prev) =>
          prev.map((ob) => (ob.id === obId ? data.obligation : ob))
        );
        toast.success("Evidence removed");
      }
    } catch (err) {
      toast.error(`Remove failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleCheckCompliance(id: number) {
    try {
      const res = await fetch(`/api/obligations/${id}/check-compliance`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        const status = data.met ? "Met" : "Not Met";
        toast.info(
          `Compliance: ${status} (${data.confidence} confidence)\n${data.assessment}`,
          { duration: 8000 }
        );
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(`Compliance check failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Obligations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track and manage contract obligations.
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="finalized">Finalized</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ObligationsStatsBar stats={stats} />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading obligations...</p>
      ) : obligations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No obligations found.</p>
          <p className="text-sm mt-1">
            Process contract documents to extract obligations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {obligations.map((ob) => (
            <ObligationCard
              key={ob.id}
              obligation={ob}
              onUpdateField={handleUpdateField}
              onAddEvidence={(id) => {
                setEvidenceObId(id);
                setEvidenceOpen(true);
              }}
              onRemoveEvidence={handleRemoveEvidence}
              onCheckCompliance={handleCheckCompliance}
            />
          ))}
        </div>
      )}

      <EvidenceDialog
        obligationId={evidenceObId}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        onEvidenceAdded={loadObligations}
      />
    </div>
  );
}
