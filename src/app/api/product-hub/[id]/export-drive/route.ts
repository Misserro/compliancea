import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature, getAppSetting, addDocument, updateDocumentMetadata, run } from "@/lib/db-imports";
import { DOCUMENTS_DIR } from "@/lib/paths-imports";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const feature = getProductFeature(numId);
  if (!feature) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { template, content, title } = body as { template?: string; content?: string; title?: string };

  if (!template || !content) {
    return NextResponse.json({ error: 'template and content are required' }, { status: 400 });
  }

  try {
    const safeTitle = (title ?? 'feature').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
    const filename = `${safeTitle}-${template}.md`;
    const localPath = path.join(DOCUMENTS_DIR, filename);
    await fs.writeFile(localPath, content, 'utf-8');

    // Add to documents table
    const docId = addDocument(filename, localPath, 'product-hub', 'Product Specs');
    updateDocumentMetadata(docId, {
      doc_type: 'product_spec',
      status: 'draft',
      tags: JSON.stringify([template, 'product-hub', 'ai-generated']),
    });

    // Upload to Drive if configured (non-fatal)
    let driveFileId: string | null = null;
    try {
      const { google } = await import('googleapis');
      const credentialsJson = getAppSetting('gdriveServiceAccount') as string | null;
      const folderId = getAppSetting('gdriveFolderId') as string | null;

      if (credentialsJson && folderId) {
        const credentials = JSON.parse(credentialsJson);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
        const drive = google.drive({ version: 'v3', auth });
        const { Readable } = await import('stream');
        const fileRes = await drive.files.create({
          requestBody: {
            name: filename,
            mimeType: 'text/plain',
            parents: [folderId],
          },
          media: {
            mimeType: 'text/plain',
            body: Readable.from([content]),
          },
          fields: 'id',
        });
        driveFileId = fileRes.data.id ?? null;
        if (driveFileId) {
          run(`UPDATE documents SET gdrive_file_id = ?, sync_status = 'synced' WHERE id = ?`, [driveFileId, docId]);
        }
      }
    } catch (driveErr) {
      console.warn('Drive upload failed (non-fatal):', driveErr);
    }

    return NextResponse.json({ ok: true, documentId: docId, driveFileId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
