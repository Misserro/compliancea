"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OutputSectionProps {
  sectionId: string;
  label: string;
  content: string;
  streaming: boolean;
  gaps: string[];
  onRegenerate: (sectionId: string) => void;
  onChange: (sectionId: string, content: string) => void;
}

export function OutputSection({
  sectionId, label, content, streaming, gaps, onRegenerate, onChange,
}: OutputSectionProps) {
  const isOpenQuestions = sectionId === 'open_questions';

  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable: !streaming,
    onUpdate: ({ editor }) => {
      onChange(sectionId, editor.getHTML());
    },
  });

  // Sync streaming content into editor
  useEffect(() => {
    if (editor && !streaming) {
      const currentHTML = editor.getHTML();
      if (currentHTML !== content) {
        editor.commands.setContent(content || '');
      }
    }
  }, [content, streaming, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!streaming);
  }, [streaming, editor]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <h4 className="text-sm font-semibold">{label}</h4>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onRegenerate(sectionId)}
          disabled={streaming}
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Regenerate
        </Button>
      </div>

      {/* Gap warnings */}
      {isOpenQuestions && gaps.length > 0 && (
        <div className="px-4 pt-3 space-y-1">
          {gaps.map((gap, i) => (
            <div key={i} className="flex gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span>⚠️</span>
              <span>{gap}</span>
            </div>
          ))}
        </div>
      )}

      <div className={cn(
        "px-4 py-3 prose prose-sm max-w-none min-h-[80px]",
        streaming && "animate-pulse opacity-70",
        "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[60px]",
      )}>
        {editor ? <EditorContent editor={editor} /> : (
          <p className="text-muted-foreground text-xs">Loading editor…</p>
        )}
      </div>
    </div>
  );
}
