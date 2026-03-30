"use client";

import { useState } from "react";
import { FolderSearch, HardDrive, Play, Tags, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ActionBarProps {
  onScanServer: () => Promise<void>;
  onScanGDrive: () => Promise<void>;
  onProcessAll: () => Promise<void>;
  onRetagAll: () => Promise<void>;
  allExpanded: boolean;
  onToggleExpand: () => void;
}

export function ActionBar({
  onScanServer,
  onScanGDrive,
  onProcessAll,
  onRetagAll,
  allExpanded,
  onToggleExpand,
}: ActionBarProps) {
  const t = useTranslations('Documents');
  const [loading, setLoading] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } finally { setLoading(null); }
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading !== null}>
            {t('actionBar.actions')}
            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => run("scan", onScanServer)}
            disabled={loading !== null}
          >
            <FolderSearch className="mr-2 h-4 w-4" />
            {loading === "scan" ? t('actionBar.scanning') : t('actionBar.scanServer')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("gdrive", onScanGDrive)}
            disabled={loading !== null}
          >
            <HardDrive className="mr-2 h-4 w-4" />
            {loading === "gdrive" ? t('actionBar.scanningGDrive') : t('actionBar.scanGDrive')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("process", onProcessAll)}
            disabled={loading !== null}
          >
            <Play className="mr-2 h-4 w-4" />
            {loading === "process" ? t('actionBar.processing') : t('actionBar.processAll')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run("retag", onRetagAll)}
            disabled={loading !== null}
          >
            <Tags className="mr-2 h-4 w-4" />
            {loading === "retag" ? t('actionBar.retagging') : t('actionBar.retagAll')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" onClick={onToggleExpand}>
        {allExpanded ? (
          <ChevronUp className="mr-2 h-4 w-4" />
        ) : (
          <ChevronDown className="mr-2 h-4 w-4" />
        )}
        {allExpanded ? t('actionBar.hideDetails') : t('actionBar.showAllDetails')}
      </Button>
    </div>
  );
}
