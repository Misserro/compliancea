"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProductFeatureCard } from "@/components/product-hub/product-feature-card";
import type { ProductFeature } from "@/lib/types";

export default function ProductHubPage() {
  const router = useRouter();
  const [features, setFeatures] = useState<ProductFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeatures = useCallback(async () => {
    try {
      const res = await fetch('/api/product-hub');
      if (res.ok) {
        const data = await res.json();
        setFeatures(data.features || []);
      }
    } catch (e) {
      toast.error(`Failed to load features: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  async function handleNewFeature() {
    try {
      const res = await fetch('/api/product-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Feature' }),
      });
      if (!res.ok) throw new Error('Failed to create feature');
      const feature = await res.json();
      router.push(`/product-hub/${feature.id}`);
    } catch (e) {
      toast.error(`Failed to create feature: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Product Hub</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Define features and generate PRDs, Tech Specs, Feature Briefs, and Business Cases with AI.
          </p>
        </div>
        <Button onClick={handleNewFeature}>
          <Plus className="h-4 w-4 mr-2" /> New Feature
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : features.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <Package className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No features yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click "New Feature" to define your first product feature.
            </p>
          </div>
          <Button onClick={handleNewFeature}><Plus className="h-4 w-4 mr-2" /> New Feature</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <ProductFeatureCard key={f.id} feature={f} onRefresh={loadFeatures} />
          ))}
        </div>
      )}
    </div>
  );
}
