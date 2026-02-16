import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAppSetting, setAppSetting } from "@/lib/db-imports";

export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  try {
    const credentialsJson = getAppSetting("gdriveServiceAccount") || "";
    const folderId = getAppSetting("gdriveFolderId") || "";

    // Extract service account email for display (don't expose full credentials)
    let serviceAccountEmail = "";
    if (credentialsJson) {
      try {
        const creds = JSON.parse(credentialsJson);
        serviceAccountEmail = creds.client_email || "";
      } catch {
        // Invalid JSON
      }
    }

    return NextResponse.json({
      folderId,
      hasCredentials: !!credentialsJson,
      serviceAccountEmail,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  await ensureDb();
  try {
    const body = await request.json();
    const { serviceAccountJson, folderId } = body;

    if (serviceAccountJson !== undefined) {
      // Validate JSON before saving
      if (serviceAccountJson.trim()) {
        try {
          const parsed = JSON.parse(serviceAccountJson);
          if (!parsed.client_email || !parsed.private_key) {
            return NextResponse.json(
              { error: "Invalid service account JSON: missing client_email or private_key fields." },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json({ error: "Invalid JSON format." }, { status: 400 });
        }
      }
      setAppSetting("gdriveServiceAccount", serviceAccountJson.trim());
    }
    if (folderId !== undefined) {
      setAppSetting("gdriveFolderId", folderId.trim());
    }

    // Return updated state
    const currentCreds = getAppSetting("gdriveServiceAccount") || "";
    let serviceAccountEmail = "";
    if (currentCreds) {
      try {
        serviceAccountEmail = JSON.parse(currentCreds).client_email || "";
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({
      folderId: getAppSetting("gdriveFolderId") || "",
      hasCredentials: !!currentCreds,
      serviceAccountEmail,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
