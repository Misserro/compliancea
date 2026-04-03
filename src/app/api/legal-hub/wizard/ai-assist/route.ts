export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic-client";
import fs from "fs/promises";
import path from "path";
import { logTokenUsage } from "@/lib/db-imports";
import { PRICING } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['legal_hub'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set." },
        { status: 500 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      blueprintName,
      documentType = null,
      sectionTitle,
      sectionKey = null,
      mode,
      previousSections = [],
      userHint = null,
      availableVariables = [],
    } = body as {
      blueprintName: string;
      documentType: string | null;
      sectionTitle: string;
      sectionKey: string | null;
      mode: "template" | "real";
      previousSections: { title: string; content: string }[];
      userHint: string | null;
      availableVariables: string[];
    };

    // Validate required fields
    if (!blueprintName || typeof blueprintName !== "string") {
      return NextResponse.json(
        { error: "blueprintName is required" },
        { status: 400 }
      );
    }
    if (!sectionTitle || typeof sectionTitle !== "string") {
      return NextResponse.json(
        { error: "sectionTitle is required" },
        { status: 400 }
      );
    }
    if (mode !== "template" && mode !== "real") {
      return NextResponse.json(
        { error: "mode must be 'template' or 'real'" },
        { status: 400 }
      );
    }

    // Read system prompt from file
    const systemPrompt = await fs.readFile(
      path.join(process.cwd(), "prompts/wizard-section-assist.md"),
      "utf-8"
    );

    // Build user message with structured context
    let userMessage = `Szablon: ${blueprintName}\n`;
    if (documentType) {
      userMessage += `Typ dokumentu: ${documentType}\n`;
    }
    userMessage += `Sekcja: ${sectionTitle}\n`;
    if (sectionKey) {
      userMessage += `Klucz sekcji: ${sectionKey}\n`;
    }
    userMessage += `Tryb: ${mode}\n`;

    if (mode === "template" && availableVariables.length > 0) {
      userMessage += `\nDostępne zmienne (availableVariables): ${availableVariables.map((v) => `{{${v}}}`).join(", ")}\n`;
    }

    if (previousSections.length > 0) {
      userMessage += `\nPoprzednie sekcje:\n`;
      for (const section of previousSections) {
        userMessage += `--- ${section.title} ---\n${section.content}\n\n`;
      }
    }

    if (userHint) {
      userMessage += `\nWskazówka użytkownika: ${userHint}\n`;
    }

    const modelName = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;

    const content = message.content
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
        route: '/api/legal-hub/wizard/ai-assist',
        model: 'sonnet',
        inputTokens,
        outputTokens,
        voyageTokens: 0,
        costUsd,
      });
    } catch (_) { /* silent */ }

    return NextResponse.json({ content });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("AI assist error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
