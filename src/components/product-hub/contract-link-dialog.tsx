"use client";

import { useState, useEffect } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Document } from "@/lib/types";

interface ContractLinkDialogProps {
  featureId: number;
  linkedContractId: number | null;
  onLinked: (contractId: number | null, contractName: string | null) => void;
}

export function ContractLinkDialog({ featureId, linkedContractId, onLinked }: ContractLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState<Document[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      fetch('/api/documents')
        .then(r => r.json())
        .then(d => setContracts(
          (d.documents || []).filter((doc: Document) => doc.doc_type === 'contract')
        ));
    }
  }, [open]);

  const filtered = contracts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSelect(contract: Document | null) {
    await fetch(`/api/product-hub/${featureId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linked_contract_id: contract?.id ?? null }),
    });
    onLinked(contract?.id ?? null, contract?.name ?? null);
    toast.success(contract ? `Linked to ${contract.name}` : 'Contract link removed');
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          {linkedContractId ? 'Change Contract Link' : 'Link to Contract'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to Contract</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search contracts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
          <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
            {linkedContractId && (
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2.5 text-xs text-destructive hover:bg-muted/40"
              >
                Remove contract link
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">No contracts found.</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <p className="text-xs font-medium">{c.name}</p>
                {c.added_at && (
                  <p className="text-[11px] text-muted-foreground">{new Date(c.added_at).toLocaleDateString()}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
