export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getCaseParties,
  addCaseParty,
  getCasePartyById,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

const PARTY_TYPES = ["plaintiff", "defendant", "third_party", "witness", "other"];

/**
 * GET /api/legal-hub/cases/[id]/parties
 * List parties for a case
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const parties = getCaseParties(id);
    return NextResponse.json({ data: parties });
  } catch (error) {
    console.error("Error fetching case parties:", error);
    return NextResponse.json(
      { error: "Failed to fetch parties" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/legal-hub/cases/[id]/parties
 * Add a party to a case
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();

    const partyType = body.party_type;
    if (!partyType || !PARTY_TYPES.includes(partyType)) {
      return NextResponse.json(
        { error: `Invalid party_type. Must be one of: ${PARTY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const newId = addCaseParty({
      caseId,
      partyType,
      name,
      address: body.address || null,
      representativeName: body.representative_name || null,
      representativeAddress: body.representative_address || null,
      representativeType: body.representative_type || null,
      notes: body.notes || null,
    });

    logAction("legal_case", caseId, "party_added", {
      partyId: newId,
      name,
      party_type: partyType,
    });

    const newParty = getCasePartyById(newId);
    return NextResponse.json({ data: newParty }, { status: 201 });
  } catch (error) {
    console.error("Error adding case party:", error);
    return NextResponse.json(
      { error: "Failed to add party" },
      { status: 500 }
    );
  }
}
