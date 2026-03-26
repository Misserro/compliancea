"use client";

import { useState } from "react";
import { FolderSearch, HardDrive, Play, Tags, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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
  const [scanning, setScanning] = useState(false);
  const [scanningGDrive, setScanningGDrive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [retagging, setRetagging] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={scanning}
        onClick={async () => {
          setScanning(true);
          try { await onScanServer(); } finally { setScanning(false); }
        }}
      >
        <FolderSearch className="mr-2 h-4 w-4" />
        {scanning ? t('actionBar.scanning') : t('actionBar.scanServer')}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={scanningGDrive}
        onClick={async () => {
          setScanningGDrive(true);
          try { await onScanGDrive(); } finally { setScanningGDrive(false); }
        }}
      >
        <HardDrive className="mr-2 h-4 w-4" />
        {scanningGDrive ? t('actionBar.scanningGDrive') : t('actionBar.scanGDrive')}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={processing}
        onClick={async () => {
          setProcessing(true);
          try { await onProcessAll(); } finally { setProcessing(false); }
        }}
      >
        <Play className="mr-2 h-4 w-4" />
        {processing ? t('actionBar.processing') : t('actionBar.processAll')}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={retagging}
        onClick={async () => {
          setRetagging(true);
          try { await onRetagAll(); } finally { setRetagging(false); }
        }}
      >
        <Tags className="mr-2 h-4 w-4" />
        {retagging ? t('actionBar.retagging') : t('actionBar.retagAll')}
      </Button>

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
