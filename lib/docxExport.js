import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

/**
 * Convert an HTML string to a DOCX Buffer.
 *
 * Strategy: strip HTML tags to plain text, split on paragraph/line breaks,
 * create docx Paragraphs. Rich formatting (bold, tables) is not preserved in v1.
 *
 * @param {string} html - HTML content (from TipTap editor)
 * @param {string} title - Document title (used as the first heading)
 * @returns {Promise<Buffer>} DOCX file as a Buffer
 */
export async function htmlToDocx(html, title) {
  // Strip HTML tags to plain text, preserving paragraph breaks
  const withBreaks = html
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');

  const lines = withBreaks
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const paragraphs = [];

  if (title) {
    paragraphs.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
      })
    );
  }

  for (const line of lines) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: line })],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
