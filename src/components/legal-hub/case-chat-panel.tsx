"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, MessageSquare, Loader2, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AnnotatedAnswer,
  type StructuredAnswer,
} from "./annotated-answer";
import {
  ActionProposalCard,
  type ActionProposal,
} from "./action-proposal-card";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  structuredAnswer?: StructuredAnswer | null;
  actionProposal?: ActionProposal | null;
  error?: string;
}

interface CaseChatPanelProps {
  caseId: number;
}

function isStructuredAnswer(data: unknown): data is StructuredAnswer {
  return (
    typeof data === "object" &&
    data !== null &&
    "answerText" in data &&
    typeof (data as StructuredAnswer).answerText === "string" &&
    "annotations" in data &&
    Array.isArray((data as StructuredAnswer).annotations) &&
    "citations" in data &&
    Array.isArray((data as StructuredAnswer).citations)
  );
}

function isActionProposal(data: unknown): data is ActionProposal {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).type === "action_proposal" &&
    Array.isArray((data as Record<string, unknown>).actions)
  );
}

export function CaseChatPanel({ caseId }: CaseChatPanelProps) {
  const router = useRouter();
  const t = useTranslations('LegalHub');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [indexingCount, setIndexingCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const EXAMPLE_PROMPTS = [
    t('chat.examplePrompt1'),
    t('chat.examplePrompt2'),
    t('chat.examplePrompt3'),
    t('chat.examplePrompt4'),
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Indexing status polling
  const checkIndexingStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/documents/status`
      );
      if (!res.ok) return 0;
      const data = await res.json();
      if (!Array.isArray(data)) return 0;
      return data.filter(
        (d: { status: string }) => d.status === "processing"
      ).length;
    } catch {
      return 0;
    }
  }, [caseId]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const count = await checkIndexingStatus();
      if (!mounted) return;
      setIndexingCount(count);
      if (count > 0) {
        timer = setTimeout(poll, 10000);
      }
    }

    poll();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [checkIndexingStatus]);

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
      const history = previousMessages
        .filter((m) => !m.actionProposal) // exclude tool_use turns — cannot be serialized as plain strings
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch(`/api/legal-hub/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: "",
            error: data.error || t('chat.errorOccurred'),
          },
        ]);
        return;
      }

      // Detect structured answer format (from grounded RAG pipeline)
      if (isStructuredAnswer(data)) {
        if (data.parseError) {
          setMessages([
            ...newMessages,
            {
              role: "assistant",
              content: t("chatParseError"),
            },
          ]);
        } else {
          setMessages([
            ...newMessages,
            {
              role: "assistant",
              content: data.answerText,
              structuredAnswer: data,
            },
          ]);
        }
      } else if (isActionProposal(data)) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: data.proposalText,
            actionProposal: data,
          },
        ]);
      } else {
        // Fallback: plain text response
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: data.answer || data.answerText || "",
          },
        ]);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "",
          error:
            err instanceof Error
              ? err.message
              : t('chat.networkError'),
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
        <span className="font-medium text-sm">{t('chat.title')}</span>
      </div>

      {/* Indexing status banner */}
      {indexingCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">
            {t('chat.indexingBanner', { count: indexingCount })}
          </span>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="pt-2 space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              {t('chat.askAboutCase')}
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
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {msg.error ? (
                <span className="text-destructive text-xs">{msg.error}</span>
              ) : msg.actionProposal ? (
                <ActionProposalCard
                  proposal={msg.actionProposal}
                  caseId={caseId}
                  onApplied={() => router.refresh()}
                  onRejected={() => {}}
                />
              ) : msg.structuredAnswer ? (
                <>
                  <AnnotatedAnswer answer={msg.structuredAnswer} />
                  {msg.structuredAnswer.usedDocuments.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('chat.sources')} {msg.structuredAnswer.usedDocuments.map(d => d.name).join(', ')}
                    </p>
                  )}
                  {msg.structuredAnswer.confidence === "low" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('chat.limitedEvidence')}
                    </p>
                  )}
                </>
              ) : (
                msg.content && (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                )
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
          placeholder={t('chat.inputPlaceholder')}
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
