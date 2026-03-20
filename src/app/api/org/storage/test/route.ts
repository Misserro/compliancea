import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

/**
 * POST /api/org/storage/test -- test S3 connection without saving (owner/admin only)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgRole = session.user.orgRole;
  if (orgRole !== "owner" && orgRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

    // Validate required fields
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

    const endpointUrl = endpoint && typeof endpoint === "string" && endpoint.trim().length > 0
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

    await client.send(new HeadBucketCommand({ Bucket: bucket.trim() }));

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const s3Error = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
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
    return NextResponse.json({ success: false, error: errorMessage });
  }
}
