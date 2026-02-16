"use client";

import { useState } from "react";
import { FolderScan, HardDrive, Play, Tags, ChevronDown, ChevronUp } from "lucide-react";
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
        <FolderScan className="mr-2 h-4 w-4" />
        {scanning ? "Scanning..." : "Scan Server Folder"}
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
        {scanningGDrive ? "Scanning..." : "Scan Google Drive"}
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
        {processing ? "Processing..." : "Process All"}
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
        {retagging ? "Retagging..." : "Retag All"}
      </Button>

      <Button variant="ghost" size="sm" onClick={onToggleExpand}>
        {allExpanded ? (
          <ChevronUp className="mr-2 h-4 w-4" />
        ) : (
          <ChevronDown className="mr-2 h-4 w-4" />
        )}
        {allExpanded ? "Hide Details" : "Show All Details"}
      </Button>
    </div>
  );
}
