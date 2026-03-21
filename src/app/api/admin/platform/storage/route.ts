import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import {
  getPlatformSettings,
  setPlatformSetting,
  deletePlatformSettings,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { encrypt } from "@/lib/storage-crypto-imports";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

/**
 * GET /api/admin/platform/storage — return current platform S3 config (super admin only)
 */
export async function GET() {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const settings = getPlatformSettings();
    const config = Object.fromEntries(
      settings.map((s: { key: string; value: string }) => [s.key, s.value])
    );

    if (config.s3SecretEncrypted) {
      return NextResponse.json({
        configured: true,
        bucket: config.s3Bucket || "",
        region: config.s3Region || "",
        accessKeyId: config.s3AccessKeyId || "",
        secretKey: "*****",
        endpoint: config.s3Endpoint || "",
      });
    }

    return NextResponse.json({ configured: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/platform/storage — save platform S3 config (super admin only)
 * Tests connection before persisting.
 */
export async function PUT(request: NextRequest) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { bucket, region, accessKeyId, secretKey, endpoint } = body as {
      bucket?: string;
      region?: string;
      accessKeyId?: string;
      secretKey?: string;
      endpoint?: string;
    };

    if (!bucket || typeof bucket !== "string" || bucket.trim().length === 0) {
      return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
    }
    if (!region || typeof region !== "string" || region.trim().length === 0) {
      return NextResponse.json({ error: "Region is required" }, { status: 400 });
    }
    if (!accessKeyId || typeof accessKeyId !== "string" || accessKeyId.trim().length === 0) {
      return NextResponse.json({ error: "Access Key ID is required" }, { status: 400 });
    }
    if (!secretKey || typeof secretKey !== "string" || secretKey.trim().length === 0) {
      return NextResponse.json({ error: "Secret Key is required" }, { status: 400 });
    }

    const endpointUrl =
      endpoint && typeof endpoint === "string" && endpoint.trim().length > 0
        ? endpoint.trim()
        : undefined;

    const client = new S3Client({
      region: endpointUrl ? "auto" : region.trim(),
      endpoint: endpointUrl,
      credentials: {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretKey.trim(),
      },
      forcePathStyle: !!endpointUrl,
    });

    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket.trim() }));
    } catch (s3Err: unknown) {
      const s3Error = s3Err as {
        name?: string;
        message?: string;
        $metadata?: { httpStatusCode?: number };
      };
      const status = s3Error.$metadata?.httpStatusCode;
      let errorMessage = "Failed to connect to S3 bucket";
      if (s3Error.name === "NoSuchBucket" || s3Error.name === "NotFound" || status === 404) {
        errorMessage = "Bucket not found";
      } else if (s3Error.name === "Forbidden" || s3Error.name === "AccessDenied" || status === 403) {
        errorMessage = "Access denied -- check your credentials and bucket permissions";
      } else if (status === 400) {
        errorMessage = "Bad request -- check region and endpoint configuration";
      } else if (s3Error.message) {
        errorMessage = s3Error.message;
      }
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const encryptedSecret = encrypt(secretKey.trim());

    setPlatformSetting("s3Bucket", bucket.trim());
    setPlatformSetting("s3Region", region.trim());
    setPlatformSetting("s3AccessKeyId", accessKeyId.trim());
    setPlatformSetting("s3SecretEncrypted", encryptedSecret);
    setPlatformSetting("s3Endpoint", endpointUrl || "");

    saveDb();
    logAction("platform_storage_config", null, "configured", {
      bucket: bucket.trim(),
      region: region.trim(),
    }, { userId: Number(session!.user.id) });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/platform/storage — remove platform S3 config (super admin only)
 */
export async function DELETE() {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    deletePlatformSettings();
    saveDb();
    logAction("platform_storage_config", null, "removed", null, {
      userId: Number(session!.user.id),
    });

    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
