"use client";

import { CitationHoverCard, type CitationRecord } from "./citation-hover-card";

export interface Annotation {
  start: number;
  end: number;
  citationIds: number[];
}

export interface StructuredAnswer {
  answerText: string;
  annotations: Annotation[];
  citations: CitationRecord[];
  usedDocuments: { id: number; name: string }[];
  confidence: "high" | "medium" | "low";
  needsDisambiguation: boolean;
}

interface Segment {
  text: string;
  citation: CitationRecord | null;
}

function splitIntoSegments(
  text: string,
  annotations: Annotation[],
  citations: CitationRecord[]
): Segment[] {
  if (!annotations || annotations.length === 0) {
    return [{ text, citation: null }];
  }

  const sorted = [...annotations].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const ann of sorted) {
    // Guard: skip overlapping annotations
    if (ann.start < cursor) continue;

    // Plain text before this annotation
    if (ann.start > cursor) {
      segments.push({ text: text.slice(cursor, ann.start), citation: null });
    }

    // Find the first valid citation for this annotation
    const citationId = ann.citationIds?.[0];
    const citation =
      citationId != null
        ? citations.find((c) => c.chunkId === citationId) ?? null
        : null;

    if (ann.end > ann.start) {
      segments.push({
        text: text.slice(ann.start, ann.end),
        citation,
      });
    }

    cursor = ann.end;
  }

  // Remaining text after last annotation
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), citation: null });
  }

  return segments;
}

interface AnnotatedAnswerProps {
  answer: StructuredAnswer;
}

export function AnnotatedAnswer({ answer }: AnnotatedAnswerProps) {
  if (!answer.answerText) return null;

  const segments = splitIntoSegments(
    answer.answerText,
    answer.annotations,
    answer.citations
  );

  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {segments.map((segment, i) => {
        if (!segment.citation) {
          return <span key={i}>{segment.text}</span>;
        }

        return (
          <CitationHoverCard key={i} citation={segment.citation}>
            <span className="border-b border-dotted border-muted-foreground/50 cursor-help">
              {segment.text}
            </span>
          </CitationHoverCard>
        );
      })}
    </div>
  );
}
