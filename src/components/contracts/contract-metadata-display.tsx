import type { Contract } from "@/lib/types";

interface ContractMetadataDisplayProps {
  contract: Contract;
}

export function ContractMetadataDisplay({ contract }: ContractMetadataDisplayProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      <div>
        <div className="text-muted-foreground text-xs font-medium mb-1">Contract Name</div>
        <div className="font-medium">{contract.name}</div>
      </div>

      <div>
        <div className="text-muted-foreground text-xs font-medium mb-1">Our Company</div>
        <div>{contract.contracting_company || "—"}</div>
      </div>

      <div>
        <div className="text-muted-foreground text-xs font-medium mb-1">Vendor</div>
        <div>{contract.contracting_vendor || contract.client || "—"}</div>
      </div>

      <div>
        <div className="text-muted-foreground text-xs font-medium mb-1">Signature Date</div>
        <div>{formatDate(contract.signature_date)}</div>
      </div>

      <div>
        <div className="text-muted-foreground text-xs font-medium mb-1">Commencement Date</div>
        <div>{formatDate(contract.commencement_date)}</div>
      </div>

      <div>
        <div className="text-muted-foreground text-xs font-medium mb-1">Expiry Date</div>
        <div>{contract.expiry_date ? formatDate(contract.expiry_date) : "Indefinite"}</div>
      </div>
    </div>
  );
}
