export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getContractById,
  updateContractMetadata,
  getObligationsByDocumentId,
  deleteObligationsByDocumentId,
} from "@/lib/db-imports";
import { ensureDb } from "@/lib/server-utils";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/contracts/[id]
 * Get contract with full details and obligations
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await ensureDb();
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const contract = await getContractById(id, orgId);
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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await ensureDb();
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      status,
      category,
      doc_type,
      contract_type,
      contracting_company,
      contracting_vendor,
      signature_date,
      commencement_date,
      expiry_date,
    } = body;

    const metadata: Record<string, any> = {};
    if (name !== undefined) metadata.name = name;
    if (status !== undefined) metadata.status = status;
    if (category !== undefined) metadata.category = category;
    if (doc_type !== undefined) metadata.doc_type = doc_type;
    if (contract_type !== undefined) metadata.contract_type = contract_type;
    if (contracting_company !== undefined) metadata.contracting_company = contracting_company;
    if (contracting_vendor !== undefined) metadata.contracting_vendor = contracting_vendor;
    if (signature_date !== undefined) metadata.signature_date = signature_date;
    if (commencement_date !== undefined) metadata.commencement_date = commencement_date;
    if (expiry_date !== undefined) metadata.expiry_date = expiry_date;

    await updateContractMetadata(id, metadata);

    // When archiving, delete all obligations for this contract
    if (metadata.status === 'archived') {
      deleteObligationsByDocumentId(id);
    }

    const updatedContract = await getContractById(id, orgId);
    if (!updatedContract) {
      return NextResponse.json(
        { error: "Contract not found after update — doc_type may not have been written" },
        { status: 500 }
      );
    }
    return NextResponse.json({ contract: updatedContract });
  } catch (error) {
    console.error("Error updating contract:", error);
    return NextResponse.json(
      { error: "Failed to update contract" },
      { status: 500 }
    );
  }
}
