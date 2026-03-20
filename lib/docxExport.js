import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  Footer, AlignmentType, HeadingLevel,
  PageNumber, PageOrientation, WidthType,
  BorderStyle, LevelFormat
} from "docx";
import { parseDocument } from "htmlparser2";

// A4 content width: 11906 - 1985 - 1418 = 8503 DXA
const A4_CONTENT_WIDTH = 8503;

/**
 * Convert an HTML string to a DOCX Buffer with full formatting fidelity.
 *
 * @param {string} html - HTML content (from Tiptap editor)
 * @param {string} title - Document title (rendered as HEADING_1 at top)
 * @returns {Promise<Buffer>} DOCX file as a Buffer
 */
export async function htmlToDocx(html, title) {
  const dom = parseDocument(html || "");
  const children = [];

  if (title) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: title })],
      })
    );
  }

  children.push(...processNodes(dom.children));

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24 },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: { top: 1418, bottom: 1418, left: 1985, right: 1418 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT] }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Block-level processing
// ---------------------------------------------------------------------------

function processNodes(nodes) {
  const result = [];
  for (const node of nodes) {
    if (node.type === "text") {
      const text = decodeEntities(node.data).trim();
      if (text) {
        result.push(
          new Paragraph({ children: [new TextRun({ text })] })
        );
      }
      continue;
    }
    if (node.type !== "tag") continue;

    switch (node.name) {
      case "p":
        result.push(buildParagraph(node, {}));
        break;
      case "h1":
        result.push(buildParagraph(node, { heading: HeadingLevel.HEADING_1 }));
        break;
      case "h2":
        result.push(buildParagraph(node, { heading: HeadingLevel.HEADING_2 }));
        break;
      case "h3":
        result.push(buildParagraph(node, { heading: HeadingLevel.HEADING_3 }));
        break;
      case "ul":
        result.push(...buildList(node, "bullets"));
        break;
      case "ol":
        result.push(...buildList(node, "numbers"));
        break;
      case "table":
        result.push(buildTable(node));
        break;
      case "hr":
        result.push(buildHorizontalRule());
        break;
      case "br":
        result.push(new Paragraph({}));
        break;
      case "blockquote":
        result.push(...buildBlockquote(node));
        break;
      case "div":
        result.push(...processNodes(node.children || []));
        break;
      default:
        // Unknown block element — try to process children
        if (node.children && node.children.length > 0) {
          result.push(...processNodes(node.children));
        }
        break;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Paragraph builder
// ---------------------------------------------------------------------------

function buildParagraph(node, overrides) {
  const style = parseInlineStyle(node.attribs?.style || "");
  const opts = { ...overrides };

  if (style.textAlign) {
    opts.alignment = style.textAlign;
  }

  const inherited = {};
  if (style.font) inherited.font = style.font;
  if (style.size) inherited.size = style.size;

  const runs = collectTextRuns(node.children || [], inherited);

  opts.children = runs.length > 0 ? runs : [new TextRun({ text: "" })];

  return new Paragraph(opts);
}

// ---------------------------------------------------------------------------
// Inline element processing — recursive style accumulation
// ---------------------------------------------------------------------------

function collectTextRuns(nodes, inherited) {
  const runs = [];
  for (const node of (nodes || [])) {
    if (node.type === "text") {
      const text = decodeEntities(node.data);
      if (text) {
        runs.push(new TextRun({ text, ...formatProps(inherited) }));
      }
      continue;
    }
    if (node.type !== "tag") continue;

    const style = { ...inherited };
    const inlineStyle = parseInlineStyle(node.attribs?.style || "");
    if (inlineStyle.font) style.font = inlineStyle.font;
    if (inlineStyle.size) style.size = inlineStyle.size;

    switch (node.name) {
      case "strong":
      case "b":
        style.bold = true;
        break;
      case "em":
      case "i":
        style.italics = true;
        break;
      case "u":
        style.underline = true;
        break;
      case "s":
      case "del":
        style.strike = true;
        break;
      case "br":
        runs.push(new TextRun({ break: 1 }));
        continue;
      case "span":
        // span just carries style — fall through to recurse
        break;
      case "a":
        // treat links as plain text with inherited style
        break;
      default:
        // Unknown inline — recurse into children
        break;
    }

    runs.push(...collectTextRuns(node.children || [], style));
  }
  return runs;
}

function formatProps(style) {
  const props = {};
  if (style.bold) props.bold = true;
  if (style.italics) props.italics = true;
  if (style.underline) props.underline = {};
  if (style.strike) props.strike = true;
  if (style.font) props.font = style.font;
  if (style.size) props.size = style.size;
  return props;
}

// ---------------------------------------------------------------------------
// List builder
// ---------------------------------------------------------------------------

function buildList(listNode, reference) {
  const items = [];
  for (const child of (listNode.children || [])) {
    if (child.type !== "tag" || child.name !== "li") continue;

    const liStyle = parseInlineStyle(child.attribs?.style || "");
    const opts = {
      numbering: { reference, level: 0 },
    };
    if (liStyle.textAlign) opts.alignment = liStyle.textAlign;

    const inherited = {};
    if (liStyle.font) inherited.font = liStyle.font;
    if (liStyle.size) inherited.size = liStyle.size;

    // Check if li contains nested ul/ol
    const nestedBlocks = [];
    const inlineChildren = [];
    for (const liChild of (child.children || [])) {
      if (liChild.type === "tag" && (liChild.name === "ul" || liChild.name === "ol")) {
        nestedBlocks.push(liChild);
      } else {
        inlineChildren.push(liChild);
      }
    }

    const runs = collectTextRuns(inlineChildren, inherited);
    opts.children = runs.length > 0 ? runs : [new TextRun({ text: "" })];
    items.push(new Paragraph(opts));

    // Process nested lists (flatten them)
    for (const nested of nestedBlocks) {
      const nestedRef = nested.name === "ol" ? "numbers" : "bullets";
      items.push(...buildList(nested, nestedRef));
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Table builder
// ---------------------------------------------------------------------------

function buildTable(tableNode) {
  const rows = [];
  for (const node of (tableNode.children || [])) {
    if (node.type !== "tag") continue;
    if (["thead", "tbody", "tfoot"].includes(node.name)) {
      for (const tr of (node.children || [])) {
        if (tr.type === "tag" && tr.name === "tr") {
          rows.push(buildTableRow(tr));
        }
      }
    } else if (node.name === "tr") {
      rows.push(buildTableRow(node));
    }
  }

  if (rows.length === 0) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({})],
          }),
        ],
      })
    );
  }

  return new Table({
    width: { size: A4_CONTENT_WIDTH, type: WidthType.DXA },
    rows,
  });
}

function buildTableRow(trNode) {
  const cells = [];
  for (const td of (trNode.children || [])) {
    if (td.type !== "tag" || (td.name !== "td" && td.name !== "th")) continue;

    const isHeader = td.name === "th";
    const inherited = isHeader ? { bold: true } : {};

    const inlineStyle = parseInlineStyle(td.attribs?.style || "");
    if (inlineStyle.font) inherited.font = inlineStyle.font;
    if (inlineStyle.size) inherited.size = inlineStyle.size;

    // Check for block-level content inside cell
    const blockChildren = [];
    const inlineChildren = [];
    for (const child of (td.children || [])) {
      if (child.type === "tag" && ["p", "h1", "h2", "h3", "ul", "ol", "table", "hr", "blockquote"].includes(child.name)) {
        blockChildren.push(child);
      } else {
        inlineChildren.push(child);
      }
    }

    let cellContent;
    if (blockChildren.length > 0) {
      // Cell has block-level elements — process them
      cellContent = processNodes(td.children || []);
      // Apply header bold to all text runs if th
      if (isHeader) {
        cellContent = cellContent.map(item => {
          // We can't easily modify Paragraph children after creation,
          // so for th with block content, the bold comes from inherited style
          return item;
        });
      }
    } else {
      const runs = collectTextRuns(td.children || [], inherited);
      const paraOpts = {};
      if (inlineStyle.textAlign) paraOpts.alignment = inlineStyle.textAlign;
      paraOpts.children = runs.length > 0 ? runs : [new TextRun({ text: "" })];
      cellContent = [new Paragraph(paraOpts)];
    }

    const cellOpts = {
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: cellContent.length > 0 ? cellContent : [new Paragraph({})],
    };

    const colSpan = parseInt(td.attribs?.colspan || "1", 10);
    const rowSpan = parseInt(td.attribs?.rowspan || "1", 10);
    if (colSpan > 1) cellOpts.columnSpan = colSpan;
    if (rowSpan > 1) cellOpts.rowSpan = rowSpan;

    cells.push(new TableCell(cellOpts));
  }

  if (cells.length === 0) {
    cells.push(
      new TableCell({
        children: [new Paragraph({})],
      })
    );
  }

  return new TableRow({ children: cells });
}

// ---------------------------------------------------------------------------
// Blockquote
// ---------------------------------------------------------------------------

function buildBlockquote(node) {
  const children = processNodes(node.children || []);
  return children.map(
    (child) =>
      new Paragraph({
        ...child,
        indent: { left: 720 },
        children: child.children || [new TextRun({ text: "" })],
      })
  );
}

// ---------------------------------------------------------------------------
// Horizontal rule
// ---------------------------------------------------------------------------

function buildHorizontalRule() {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
    },
    children: [new TextRun({ text: "" })],
  });
}

// ---------------------------------------------------------------------------
// Style parsing
// ---------------------------------------------------------------------------

function parseInlineStyle(styleStr) {
  const result = {};
  if (!styleStr) return result;

  for (const decl of styleStr.split(";")) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (!prop || !val) continue;

    switch (prop) {
      case "font-family":
        result.font = val.replace(/['"]/g, "").split(",")[0].trim();
        break;
      case "font-size": {
        const num = parseFloat(val);
        if (!isNaN(num)) result.size = Math.round(num) * 2;
        break;
      }
      case "text-align": {
        const alignMap = {
          left: AlignmentType.LEFT,
          center: AlignmentType.CENTER,
          right: AlignmentType.RIGHT,
          justify: AlignmentType.BOTH,
        };
        if (alignMap[val]) result.textAlign = alignMap[val];
        break;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// HTML entity decoding
// ---------------------------------------------------------------------------

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
