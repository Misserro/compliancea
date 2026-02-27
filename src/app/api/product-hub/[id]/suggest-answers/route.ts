import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature } from "@/lib/db-imports";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

interface SuggestAnswersBody {
  gaps: string[];
  intakeSummary: string;
}

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const feature = getProductFeature(Number(id));
  if (!feature) return Response.json({ error: 'Not found' }, { status: 404 });

  const body: SuggestAnswersBody = await req.json();
  const { gaps, intakeSummary } = body;

  if (!gaps || gaps.length === 0) {
    return Response.json({ suggestions: [] });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const questionsText = gaps
    .slice(0, 10)
    .map((g, i) => `${i + 1}. ${g}`)
    .join('\n');

  const prompt = `You are helping a product manager fill in gaps in a product requirements document.

Feature context:
${intakeSummary}

For each question below, generate exactly 2-3 short, plausible answer suggestions (1-2 sentences each) that a product manager might give. Base them on the feature context above.

Questions:
${questionsText}

Respond ONLY with valid JSON in this exact format (no markdown, no preamble):
[
  {
    "question": "exact question text from above",
    "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]';

    // Strip any markdown code fences if present
    const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/```$/m, '').trim();
    const parsed = JSON.parse(clean);

    return Response.json({ suggestions: parsed });
  } catch (e) {
    // Degrade gracefully — return empty suggestions, panel still renders without chips
    console.error('suggest-answers error:', e);
    return Response.json({ suggestions: [] });
  }
}
