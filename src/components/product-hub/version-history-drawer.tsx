"use client";

import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { GeneratedOutputs } from "@/lib/types";

interface VersionSnapshot {
  timestamp: string;
  trigger: 'generate' | 'regenerate' | 'manual';
  templates: string[];
  snapshot: GeneratedOutputs;
}

interface VersionHistoryDrawerProps {
  versionHistoryJson: string | null;
  onRestore: (snapshot: GeneratedOutputs) => void;
}

export function VersionHistoryDrawer({ versionHistoryJson, onRestore }: VersionHistoryDrawerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const history: VersionSnapshot[] = (() => {
    try { return JSON.parse(versionHistoryJson || '[]').reverse(); }
    catch { return []; }
  })();

  const selected = selectedIndex !== null ? history[selectedIndex] : null;

  if (history.length === 0) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <History className="h-3.5 w-3.5 mr-1.5" /> History
      </Button>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="h-3.5 w-3.5 mr-1.5" /> History ({history.length})
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:w-[580px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm">Version History</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 overflow-hidden">
          {/* Snapshot list */}
          <div className="w-44 border-r overflow-y-auto">
            {history.map((v, i) => (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-xs border-b hover:bg-muted/40 transition-colors",
                  selectedIndex === i && "bg-muted",
                )}
              >
                <p className="font-medium">{new Date(v.timestamp).toLocaleDateString()}</p>
                <p className="text-muted-foreground">{new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-muted-foreground mt-0.5 capitalize">{v.trigger}</p>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {new Date(selected.timestamp).toLocaleString()} — {selected.trigger}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onRestore(selected.snapshot)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Restore
                  </Button>
                </div>
                {Object.entries(selected.snapshot).map(([templateId, output]) => (
                  <div key={templateId} className="border rounded p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{templateId}</p>
                    {Object.entries(output.sections).slice(0, 2).map(([sectionId, content]) => (
                      <div key={sectionId}>
                        <p className="text-xs font-medium">{sectionId}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-3">
                          {(content as string).replace(/<[^>]+>/g, '').slice(0, 200)}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                Select a version to preview
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
