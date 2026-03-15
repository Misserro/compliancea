import { Suspense } from "react";
import { ContractsNewForm } from "./ContractsNewForm";

export default function ContractsNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ContractsNewForm />
    </Suspense>
  );
}
