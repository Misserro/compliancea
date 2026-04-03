export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic-client";
import fs from "fs/promises";
import path from "path";
import { logTokenUsage } from "@/lib/db-imports";
import { PRICING } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";
import { ensureDb } from "@/lib/server-utils";
import { combineWizardSections } from "@/lib/wizard-blueprints";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === "member") {
    const perm =
      (session.user.permissions as Record<string, string> | null)?.[
        "legal_hub"
      ] ?? "full";
    if (!hasPermission(perm as any, "edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { sections, blueprintName, documentType } = body as {
      sections: { title: string; content: string }[];
      blueprintName: string;
      documentType: string | null;
    };

    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json(
        { error: "sections must be a non-empty array" },
        { status: 400 }
      );
    }

    for (const section of sections) {
      if (
        typeof section.title !== "string" ||
        typeof section.content !== "string"
      ) {
        return NextResponse.json(
          { error: "Each section must have a title and content string" },
          { status: 400 }
        );
      }
    }

    if (!blueprintName || typeof blueprintName !== "string") {
      return NextResponse.json(
        { error: "blueprintName is required" },
        { status: 400 }
      );
    }

    // Assemble draft HTML from sections
    const draftHtml = combineWizardSections(sections);

    // Read system prompt
    const systemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/wizard-document-polish.md"),
      "utf-8"
    );

    // Build user message with context
    const docTypeInfo = documentType
      ? `Typ dokumentu: ${documentType}`
      : "Typ dokumentu: nieokreślony";

    const userMessage = `Nazwa szablonu: ${blueprintName}\n${docTypeInfo}\n\nPoniżej znajduje się szkic dokumentu w HTML do przepisania:\n\n${draftHtml}`;

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;

    const polishedHtml = message.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("");

    const costUsd =
      (inputTokens / 1_000_000) * PRICING.claude.sonnet.input +
      (outputTokens / 1_000_000) * PRICING.claude.sonnet.output;
    try {
      logTokenUsage({
        userId: Number(session.user.id),
        orgId: Number(session.user.orgId),
        route: '/api/legal-hub/wizard/ai-polish',
        model: 'sonnet',
        inputTokens,
        outputTokens,
        voyageTokens: 0,
        costUsd,
      });
    } catch (_) { /* silent */ }

    return NextResponse.json({ polishedHtml });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
