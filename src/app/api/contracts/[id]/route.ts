import { NextResponse } from "next/server";
import {
  getContractById,
  updateContractMetadata,
  getObligationsByDocumentId,
} from "@/lib/db-imports";

/**
 * GET /api/contracts/[id]
 * Get contract with full details and obligations
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const contract = await getContractById(id);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const obligations = await getObligationsByDocumentId(id);

    return NextResponse.json({
      contract: {
        ...contract,
        obligations,
      },
    });
  } catch (error) {
    console.error("Error fetching contract:", error);
    return NextResponse.json(
      { error: "Failed to fetch contract" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/contracts/[id]
 * Update contract metadata
 */
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      contracting_company,
      contracting_vendor,
      signature_date,
      commencement_date,
      expiry_date,
    } = body;

    const metadata: Record<string, any> = {};
    if (contracting_company !== undefined) metadata.contracting_company = contracting_company;
    if (contracting_vendor !== undefined) metadata.contracting_vendor = contracting_vendor;
    if (signature_date !== undefined) metadata.signature_date = signature_date;
    if (commencement_date !== undefined) metadata.commencement_date = commencement_date;
    if (expiry_date !== undefined) metadata.expiry_date = expiry_date;

    await updateContractMetadata(id, metadata);

    const updatedContract = await getContractById(id);
    return NextResponse.json({ contract: updatedContract });
  } catch (error) {
    console.error("Error updating contract:", error);
    return NextResponse.json(
      { error: "Failed to update contract" },
      { status: 500 }
    );
  }
}
