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

function buildIntakeText(intake: IntakeForm): string {
  const { sectionA: a, sectionB: b, sectionC: c } = intake;
  return [
    `Problem: ${a.problemStatement}`, `Persona: ${a.persona}`,
    `Status quo: ${a.statusQuo}`, `Feature: ${b.featureDescription}`,
    `User flow: ${b.userFlow}`, `Acceptance criteria: ${b.acceptanceCriteria}`,
    `KPIs: ${c.kpis}`,
    c.mustHave ? `Must Have: ${c.mustHave}` : '',
  ].filter(Boolean).join('\n');
}

export async function POST(req: NextRequest, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const feature = getProductFeature(Number(id));
  if (!feature) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  const body = await req.json();
  const template: TemplateId = body.template;
  const sectionId: string = body.section;

  const intake: IntakeForm = JSON.parse(feature.intake_form_json || '{}');
  const selectedDocIds: number[] = JSON.parse(feature.selected_document_ids || '[]');
  const freeContext: string = feature.free_context || '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const systemPrompt = await fs.readFile(path.join(process.cwd(), TEMPLATE_PROMPT_FILES[template]), 'utf-8');
        const ragResults = selectedDocIds.length > 0
          ? await searchDocuments(buildIntakeText(intake), { documentIds: selectedDocIds, topK: 5 })
          : [];

        const userPrompt = [
          `# Task\nRegenerate ONLY the "${sectionId}" section of the ${template.replace('_', ' ')} document.`,
          `# Intake Form\n${buildIntakeText(intake)}`,
          ragResults.length > 0 ? `# Document Context\n${formatSearchResultsForCitations(ragResults)}` : '',
          freeContext ? `# Additional Context\n${freeContext}` : '',
          `# Output\nOutput only the content for the "${sectionId}" section. Do not include any section headers or delimiters. Start directly with the content.`,
        ].filter(Boolean).join('\n\n');

        let rawOutput = '';
        const response = await anthropic.messages.create({
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            rawOutput += chunk.delta.text;
            emit({ type: 'token', content: chunk.delta.text });
          }
        }

        // Update this section in stored outputs
        const allOutputs = JSON.parse(feature.generated_outputs_json || '{}');
        if (!allOutputs[template]) allOutputs[template] = { sections: {}, gaps: [] };
        allOutputs[template].sections[sectionId] = rawOutput.trim();
        updateProductFeature(Number(id), { generated_outputs_json: JSON.stringify(allOutputs) });

        emit({ type: 'done', section: sectionId, content: rawOutput.trim() });
      } catch (e) {
        emit({ type: 'error', message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Accel-Buffering': 'no' },
  });
}
