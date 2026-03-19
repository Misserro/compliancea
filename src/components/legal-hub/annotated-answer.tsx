"use client";

import { useMemo } from "react";
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
  citations: CitationRecord[];
}

function splitIntoSegments(
  text: string,
  annotations: Annotation[],
  citations: CitationRecord[]
): Segment[] {
  if (!annotations || annotations.length === 0) {
    return [{ text, citations: [] }];
  }

  const sorted = [...annotations].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const ann of sorted) {
    // Validate annotation bounds
    if (ann.start < 0 || ann.end > text.length || ann.start >= ann.end) continue;
    // Skip overlapping annotations
    if (ann.start < cursor) continue;

    // Plain text before this annotation
    if (ann.start > cursor) {
      segments.push({ text: text.slice(cursor, ann.start), citations: [] });
    }

    // Collect ALL matching citations for this annotation
    const matchedCitations = (ann.citationIds ?? [])
      .map((id) => citations.find((c) => c.chunkId === id))
      .filter((c): c is CitationRecord => c !== undefined);

    if (matchedCitations.length === 0) {
      // No valid citations — render as plain text
      segments.push({ text: text.slice(ann.start, ann.end), citations: [] });
    } else {
      segments.push({
        text: text.slice(ann.start, ann.end),
        citations: matchedCitations,
      });
    }

    cursor = ann.end;
  }

  // Remaining text after last annotation
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), citations: [] });
  }

  return segments;
}

interface AnnotatedAnswerProps {
  answer: StructuredAnswer;
}

export function AnnotatedAnswer({ answer }: AnnotatedAnswerProps) {
  if (!answer.answerText) return null;

  const segments = useMemo(
    () => splitIntoSegments(answer.answerText, answer.annotations, answer.citations),
    [answer.answerText, answer.annotations, answer.citations]
  );

  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {segments.map((segment, i) => {
        if (segment.citations.length === 0) {
          return <span key={i}>{segment.text}</span>;
        }

        return (
          <CitationHoverCard key={i} citations={segment.citations}>
            <span
              className="underline decoration-dotted decoration-muted-foreground/50 cursor-help hover:decoration-foreground/70 focus:decoration-foreground/70"
              tabIndex={0}
            >
              {segment.text}
            </span>
          </CitationHoverCard>
        );
      })}
    </div>
  );
}
