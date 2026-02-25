"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TEMPLATE_SECTIONS, TEMPLATES, type TemplateId, type GeneratedOutputs } from "@/lib/types";

interface ExportMenuProps {
  featureTitle: string;
  activeTemplate: TemplateId;
  outputs: GeneratedOutputs;
  featureId: number;
}

function outputsToMarkdown(title: string, templateId: TemplateId, outputs: GeneratedOutputs): string {
  const templateDef = TEMPLATES.find(t => t.id === templateId);
  const sections = TEMPLATE_SECTIONS[templateId] ?? [];
  const output = outputs[templateId];
  if (!output) return '';

  const lines = [`# ${title} — ${templateDef?.name ?? templateId}`, ''];
  for (const section of sections) {
    lines.push(`## ${section.label}`, '');
    const content = (output.sections[section.id] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    lines.push(content, '');
  }
  return lines.join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportMenu({ featureTitle, activeTemplate, outputs, featureId }: ExportMenuProps) {
  function handleMarkdown() {
    const md = outputsToMarkdown(featureTitle, activeTemplate, outputs);
    if (!md) { toast.error('No content to export'); return; }
    const blob = new Blob([md], { type: 'text/markdown' });
    downloadBlob(blob, `${featureTitle}-${activeTemplate}.md`);
    toast.success('Markdown downloaded');
  }

  async function handleDocx() {
    try {
      const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
      const sections = TEMPLATE_SECTIONS[activeTemplate] ?? [];
      const output = outputs[activeTemplate];
      if (!output) { toast.error('No content to export'); return; }

      const children = sections.flatMap(section => {
        const content = (output.sections[section.id] ?? '').replace(/<[^>]+>/g, '').trim();
        return [
          new Paragraph({ text: section.label, heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun(content)] }),
          new Paragraph(''),
        ];
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({ text: featureTitle, heading: HeadingLevel.TITLE }),
            new Paragraph({ text: TEMPLATES.find(t => t.id === activeTemplate)?.name ?? activeTemplate, heading: HeadingLevel.HEADING_1 }),
            new Paragraph(''),
            ...children,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${featureTitle}-${activeTemplate}.docx`);
      toast.success('DOCX downloaded');
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  }

  async function handlePdf() {
    try {
      const { jsPDF } = await import('jspdf');
      const sections = TEMPLATE_SECTIONS[activeTemplate] ?? [];
      const output = outputs[activeTemplate];
      if (!output) { toast.error('No content to export'); return; }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = 20;

      function addText(text: string, fontSize: number, bold = false, color = [0, 0, 0] as [number, number, number]) {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(text, maxWidth);
        if (y + lines.length * (fontSize * 0.4) > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage(); y = 20;
        }
        doc.text(lines, margin, y);
        y += lines.length * (fontSize * 0.4) + 4;
      }

      addText(featureTitle, 18, true);
      addText(TEMPLATES.find(t => t.id === activeTemplate)?.name ?? activeTemplate, 14, false, [80, 80, 80]);
      y += 4;

      for (const section of sections) {
        const content = (output.sections[section.id] ?? '').replace(/<[^>]+>/g, '').trim();
        if (!content) continue;
        addText(section.label, 13, true);
        addText(content, 10);
        y += 3;
      }

      doc.save(`${featureTitle}-${activeTemplate}.pdf`);
      toast.success('PDF downloaded');
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  }

  async function handleSaveToDrive() {
    try {
      const md = outputsToMarkdown(featureTitle, activeTemplate, outputs);
      const res = await fetch(`/api/product-hub/${featureId}/export-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: activeTemplate, content: md, title: featureTitle }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Saved to Google Drive and added to Documents tab');
    } catch (e) {
      toast.error(`Drive export failed: ${String(e)}`);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleMarkdown}>Markdown (.md)</DropdownMenuItem>
        <DropdownMenuItem onClick={handleDocx}>Word Document (.docx)</DropdownMenuItem>
        <DropdownMenuItem onClick={handlePdf}>PDF (.pdf)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSaveToDrive}>Save to Google Drive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
