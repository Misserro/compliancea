"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Extension } from "@tiptap/core";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  TableIcon,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useCallback, useImperativeHandle, forwardRef } from "react";

// Custom FontSize extension extending TextStyle
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize?.replace("pt", "") || null,
            renderHTML: (attrs) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}pt` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }: { chain: () => any }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }: { chain: () => any }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Arial", value: "Arial" },
  { label: "Calibri", value: "Calibri" },
  { label: "Georgia", value: "Georgia" },
  { label: "Verdana", value: "Verdana" },
];

const FONT_SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24"];

export interface RichTextEditorHandle {
  insertText: (text: string) => void;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor(
    { content, onChange, placeholder, className, minHeight = "300px" },
    ref
  ) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      FontFamily,
      FontSize,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  // Expose insertText to parent via ref
  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      editor?.commands.insertContent(text);
    },
  }), [editor]);

  // Sync content when prop changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  if (!editor) {
    return (
      <div className={cn("border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring", className)}>
        <div className="border-b bg-muted/30 px-2 py-1 h-9" />
        <div className="p-4" style={{ minHeight }} />
      </div>
    );
  }

  return (
    <div
      className={cn("border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring cursor-text", className)}
      onClick={() => editor.commands.focus()}
    >
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none p-4 [&_.ProseMirror]:outline-none"
        style={{ minHeight }}
      />
    </div>
  );
});

// ---------- Toolbar ----------

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const isInTable = editor.isActive("table");

  const handleFontFamily = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value) {
        editor.chain().focus().setFontFamily(value).run();
      } else {
        editor.chain().focus().unsetFontFamily().run();
      }
    },
    [editor]
  );

  const handleFontSize = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value) {
        (editor.chain().focus() as any).setFontSize(value).run();
      } else {
        (editor.chain().focus() as any).unsetFontSize().run();
      }
    },
    [editor]
  );

  const currentFontFamily =
    (editor.getAttributes("textStyle").fontFamily as string) || "";
  const currentFontSize =
    (editor.getAttributes("textStyle").fontSize as string) || "";

  return (
    <div className="border-b bg-muted/30 px-2 py-1 flex flex-wrap gap-1 items-center">
      {/* Font family */}
      <select
        value={currentFontFamily}
        onChange={handleFontFamily}
        className="h-7 text-xs border rounded px-1 bg-background"
        title="Font family"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size */}
      <select
        value={currentFontSize}
        onChange={handleFontSize}
        className="h-7 text-xs border rounded px-1 bg-background w-14"
        title="Font size"
      >
        <option value="">--</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}pt
          </option>
        ))}
      </select>

      <ToolbarDivider />

      {/* Bold / Italic / Underline */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <span className="text-xs font-bold">H1</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <span className="text-xs font-bold">H2</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <span className="text-xs font-bold">H3</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setParagraph().run()}
        active={editor.isActive("paragraph") && !editor.isActive("heading")}
        title="Paragraph"
      >
        <span className="text-xs font-bold">P</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Align left"
      >
        <AlignLeft className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Align center"
      >
        <AlignCenter className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Align right"
      >
        <AlignRight className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
        title="Justify"
      >
        <AlignJustify className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered list"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Table controls */}
      <ToolbarButton
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        active={false}
        title="Insert table (3x3)"
      >
        <TableIcon className="w-4 h-4" />
      </ToolbarButton>

      {isInTable && (
        <>
          <ToolbarButton
            onClick={() => editor.chain().focus().addRowAfter().run()}
            active={false}
            title="Add row"
          >
            <Plus className="w-3 h-3" />
            <span className="text-[10px]">Row</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().deleteRow().run()}
            active={false}
            title="Delete row"
          >
            <Minus className="w-3 h-3" />
            <span className="text-[10px]">Row</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            active={false}
            title="Add column"
          >
            <Plus className="w-3 h-3" />
            <span className="text-[10px]">Col</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().deleteColumn().run()}
            active={false}
            title="Delete column"
          >
            <Minus className="w-3 h-3" />
            <span className="text-[10px]">Col</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().deleteTable().run()}
            active={false}
            title="Delete table"
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </ToolbarButton>
        </>
      )}
    </div>
  );
}

// ---------- Toolbar primitives ----------

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-0.5 h-7 px-1.5 rounded text-sm transition-colors hover:bg-muted",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-border mx-1" />;
}
