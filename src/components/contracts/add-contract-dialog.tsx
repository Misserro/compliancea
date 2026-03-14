"use client";

interface AddContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddContractDialog({ open, onOpenChange }: AddContractDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg p-6 w-full max-w-md">
        <p className="text-sm text-muted-foreground">Add contract dialog — coming soon</p>
        <button onClick={() => onOpenChange(false)} className="mt-4 text-sm underline">Close</button>
      </div>
    </div>
  );
}
