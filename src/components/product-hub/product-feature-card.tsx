"use client";

import { ExternalLink, Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import type { ProductFeature, FeatureStatus } from "@/lib/types";

interface ProductFeatureCardProps {
  feature: ProductFeature;
  onRefresh: () => void;
}

export function ProductFeatureCard({ feature, onRefresh }: ProductFeatureCardProps) {
  const router = useRouter();

  const docCount = (() => {
    try { return (JSON.parse(feature.selected_document_ids ?? '[]') as number[]).length; }
    catch { return 0; }
  })();

  const templates = (() => {
    try { return (JSON.parse(feature.selected_templates ?? '[]') as string[]); }
    catch { return []; }
  })();

  async function handleStatusChange(status: FeatureStatus) {
    try {
      const res = await fetch(`/api/product-hub/${feature.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) onRefresh();
    } catch { /* ignore */ }
  }

  async function handleDuplicate() {
    try {
      const res = await fetch('/api/product-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${feature.title} (copy)` }),
      });
      if (!res.ok) { toast.error('Failed to duplicate feature'); return; }
      const newFeature = await res.json();
      const patchRes = await fetch(`/api/product-hub/${newFeature.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intake_form_json: feature.intake_form_json,
          selected_document_ids: feature.selected_document_ids,
          free_context: feature.free_context,
          selected_templates: feature.selected_templates,
        }),
      });
      if (patchRes.ok) {
        toast.success('Feature duplicated');
        onRefresh();
      }
    } catch (e) {
      toast.error(`Failed to duplicate: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${feature.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/product-hub/${feature.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Feature deleted');
        onRefresh();
      } else {
        toast.error('Failed to delete feature');
      }
    } catch (e) {
      toast.error(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm leading-snug flex-1 truncate">{feature.title}</h3>
        <StatusBadge status={feature.status} editable onChange={handleStatusChange} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{new Date(feature.created_at).toLocaleDateString()}</span>
        {docCount > 0 && <span>{docCount} document{docCount !== 1 ? 's' : ''}</span>}
        {templates.length > 0 && <span>{templates.length} template{templates.length !== 1 ? 's' : ''}</span>}
      </div>

      <div className="flex items-center gap-1 pt-1">
        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => router.push(`/product-hub/${feature.id}`)}>
          <ExternalLink className="h-3 w-3 mr-1" /> Open
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDuplicate}>
          <Copy className="h-3 w-3 mr-1" /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
