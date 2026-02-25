import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { ensureDb } from "@/lib/server-utils";
import { getProductFeature, updateProductFeature } from "@/lib/db-imports";
import { searchDocuments, formatSearchResultsForCitations } from "@/lib/search-imports";
import type { TemplateId, IntakeForm } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const TEMPLATE_PROMPT_FILES: Record<TemplateId, string> = {
  feature_brief: 'prompts/prompt_feature_brief.md',
  prd: 'prompts/prompt_prd.md',
  tech_spec: 'prompts/prompt_tech_spec.md',
  business_case: 'prompts/prompt_business_case.md',
};

function parseSections(rawText: string): { sections: Record<string, string>; gaps: string[] } {
  const sections: Record<string, string> = {};
  const gaps: string[] = [];
  const parts = rawText.split(/===SECTION:\s*(\w+)===/);

  // parts[0] is preamble (before first section), then alternating [sectionName, content, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const sectionId = parts[i].toLowerCase().trim();
    const content = (parts[i + 1] || '').trim();
    sections[sectionId] = content;

    // Detect AI-flagged gaps (⚠️ markers)
    const gapMatches = content.match(/⚠️[^\n]+/g);
    if (gapMatches) gaps.push(...gapMatches.map(g => g.replace('⚠️', '').trim()));
  }

  return { sections, gaps };
}

function buildIntakeText(intake: IntakeForm): string {
  const { sectionA: a, sectionB: b, sectionC: c } = intake;
  return [
    `## Section A: Problem & Context`,
    `Problem: ${a.problemStatement}`,
    `Persona: ${a.persona}`,
    `Status quo: ${a.statusQuo}`,
    a.whyNow ? `Why now: ${a.whyNow}` : '',
    `\n## Section B: Feature Definition`,
    `Feature description: ${b.featureDescription}`,
    `User flow: ${b.userFlow}`,
    b.outOfScope ? `Out of scope: ${b.outOfScope}` : '',
    `Acceptance criteria: ${b.acceptanceCriteria}`,
    `\n## Section C: Constraints & Success Metrics`,
    c.constraints ? `Constraints: ${c.constraints}` : '',
    `KPIs: ${c.kpis}`,
    c.systems ? `Systems/integrations: ${c.systems}` : '',
    `\n### MoSCoW Prioritization`,
    `Must Have:\n${c.mustHave || '(none specified)'}`,
    `Should Have:\n${c.shouldHave || '(none specified)'}`,
    `Nice to Have:\n${c.niceToHave || '(none specified)'}`,
  ].filter(Boolean).join('\n');
}

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500 });
  }

  const feature = getProductFeature(Number(id));
  if (!feature) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const body = await req.json();
  const templates: TemplateId[] = body.templates || [];
  const intakeFormJson: string = body.intake_form_json || feature.intake_form_json || '{}';
  const selectedDocIds: number[] = JSON.parse(body.selected_document_ids || feature.selected_document_ids || '[]');
  const freeContext: string = body.free_context || feature.free_context || '';

  let intake: IntakeForm;
  try { intake = JSON.parse(intakeFormJson); }
  catch { return new Response(JSON.stringify({ error: 'Invalid intake_form_json' }), { status: 400 }); }

  const encoder = new TextEncoder();
  const allOutputs: Record<string, { sections: Record<string, string>; gaps: string[] }> = {};

  // Preserve existing outputs for untouched templates
  try {
    const existing = JSON.parse(feature.generated_outputs_json || '{}');
    Object.assign(allOutputs, existing);
  } catch { /* ignore */ }

  // Push version snapshot before overwriting
  const history = (() => {
    try { return JSON.parse(feature.version_history_json || '[]'); } catch { return []; }
  })();
  if (feature.generated_outputs_json) {
    history.push({
      timestamp: new Date().toISOString(),
      trigger: 'generate',
      templates,
      snapshot: JSON.parse(feature.generated_outputs_json),
    });
    if (history.length > 20) history.shift();
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      try {
        const intakeText = buildIntakeText(intake);

        // RAG: fetch relevant chunks from selected documents
        const ragResults = selectedDocIds.length > 0
          ? await searchDocuments(intakeText, { documentIds: selectedDocIds, topK: 8 })
          : [];
        const ragContext = formatSearchResultsForCitations(ragResults);

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        for (const templateId of templates) {
          emit({ type: 'template_start', template: templateId });

          const promptFile = TEMPLATE_PROMPT_FILES[templateId];
          const systemPrompt = await fs.readFile(path.join(process.cwd(), promptFile), 'utf-8');

          const userPrompt = [
            `# Intake Form\n${intakeText}`,
            ragResults.length > 0 ? `\n# Relevant Document Excerpts\n${ragContext}` : '',
            freeContext ? `\n# Additional Context\n${freeContext}` : '',
            `\n# Output Instructions\nOutput each section preceded by a delimiter on its own line in the format:\n===SECTION: section_id===\n\nUse the exact section IDs defined in the template structure. Start immediately with the first section delimiter.`,
          ].filter(Boolean).join('\n\n');

          let rawOutput = '';

          const response = await anthropic.messages.create({
            model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          });

          for await (const chunk of response) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const text = chunk.delta.text;
              rawOutput += text;
              emit({ type: 'raw_token', template: templateId, content: text });
            }
          }

          const parsed = parseSections(rawOutput);
          allOutputs[templateId] = parsed;

          emit({ type: 'template_complete', template: templateId, sections: parsed.sections, gaps: parsed.gaps });
        }

        // Persist results
        updateProductFeature(Number(id), {
          generated_outputs_json: JSON.stringify(allOutputs),
          selected_templates: JSON.stringify(templates),
          version_history_json: JSON.stringify(history),
        });

        emit({ type: 'done', feature_id: Number(id) });
      } catch (e) {
        emit({ type: 'error', message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
