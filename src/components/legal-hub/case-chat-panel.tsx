"use client";

import { useState, useRef, useEffect } from "react";
import { Send, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Source {
  documentName: string;
  documentId: number;
  score?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
}

interface CaseChatPanelProps {
  caseId: number;
}

const EXAMPLE_PROMPTS = [
  "Jaki jest numer referencyjny sprawy?",
  "Kto jest pozwanym w tej sprawie?",
  "Kiedy jest najbliższa rozprawa?",
  "Znajdź informacje w dokumentach sprawy",
];

function SourceCard({ source }: { source: Source }) {
  return (
    <div className="text-xs p-2 rounded border bg-background space-y-0.5">
      <div className="font-medium truncate">{source.documentName}</div>
      {source.score != null && (
        <div className="text-muted-foreground">
          Trafność: {Math.round(source.score * 100)}%
        </div>
      )}
    </div>
  );
}

export function CaseChatPanel({ caseId }: CaseChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const previousMessages = messages;
    const newMessages = [...previousMessages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const history = previousMessages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`/api/legal-hub/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "", error: data.error || "Wystąpił błąd." },
        ]);
        return;
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.answer || "",
          sources: data.sources ?? [],
        },
      ]);
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "",
          error: err instanceof Error ? err.message : "Błąd sieci. Spróbuj ponownie.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col border rounded-lg bg-card overflow-hidden"
      style={{ minHeight: "480px", height: "calc(100vh - 280px)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 shrink-0">
        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm">Asystent sprawy</span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="pt-2 space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Zadaj pytanie o tę sprawę
            </p>
            <div className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left text-xs px-3 py-2 rounded-md border border-dashed hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {msg.error ? (
                <span className="text-destructive text-xs">{msg.error}</span>
              ) : (
                <>
                  {msg.content && (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  )}
                  {(msg.sources ?? []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">Źródła:</p>
                      {msg.sources!.map((source, si) => (
                        <SourceCard key={`${source.documentId}-${si}`} source={source} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2 flex gap-2 shrink-0">
        <Input
          ref={inputRef}
          placeholder="Zadaj pytanie o sprawę…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          disabled={loading}
          className="text-sm h-8"
        />
        <Button
          size="sm"
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="h-8 px-2 shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
