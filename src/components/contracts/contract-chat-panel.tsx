"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ContractResult {
  id: number;
  name: string;
  status: string;
  contracting_company?: string | null;
  contracting_vendor?: string | null;
  client?: string | null;
  expiry_date?: string | null;
  nextDeadline?: string | null;
  activeObligations?: number;
  overdueObligations?: number;
}

interface ObligationResult {
  id: number;
  document_id: number;
  document_name: string;
  title: string;
  due_date?: string | null;
  category?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  results?: {
    contracts: ContractResult[];
    obligations: ObligationResult[];
  };
  followUpSuggestions?: string[];
  error?: string;
}

interface ContractChatPanelProps {
  selectedContractId?: number | null;
  selectedContractName?: string | null;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  "Which contracts expire in the next 60 days?",
  "Show overdue payment obligations",
  "Find contracts missing an expiry date",
  "Summarize the selected contract",
];

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function ContractResultCard({ contract }: { contract: ContractResult }) {
  const expiry = formatDate(contract.expiry_date);
  const deadline = formatDate(contract.nextDeadline);
  return (
    <div className="text-xs p-2 rounded border bg-background space-y-0.5">
      <div className="font-medium truncate">{contract.name}</div>
      <div className="flex flex-wrap gap-x-2 text-muted-foreground">
        <span className="capitalize">{contract.status}</span>
        {contract.contracting_vendor && <span>{contract.contracting_vendor}</span>}
        {expiry && <span>Expires {expiry}</span>}
        {(contract.overdueObligations ?? 0) > 0 && (
          <span className="text-destructive font-medium">
            {contract.overdueObligations} overdue
          </span>
        )}
        {(contract.activeObligations ?? 0) > 0 && !(contract.overdueObligations) && (
          <span>{contract.activeObligations} active obligations</span>
        )}
        {deadline && <span>Next: {deadline}</span>}
      </div>
    </div>
  );
}

function ObligationResultCard({ obligation }: { obligation: ObligationResult }) {
  const due = formatDate(obligation.due_date);
  return (
    <div className="text-xs p-2 rounded border bg-background space-y-0.5">
      <div className="font-medium truncate">{obligation.title}</div>
      <div className="flex flex-wrap gap-x-2 text-muted-foreground">
        <span>{obligation.document_name}</span>
        {obligation.category && <span className="capitalize">{obligation.category}</span>}
        {due && <span>Due {due}</span>}
        {obligation.payment_amount != null && (
          <span className="font-medium">
            {obligation.payment_amount} {obligation.payment_currency}
          </span>
        )}
      </div>
    </div>
  );
}

export function ContractChatPanel({
  selectedContractId,
  selectedContractName,
  onClose,
}: ContractChatPanelProps) {
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

      const res = await fetch("/api/contracts/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          selectedContractId: selectedContractId ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "", error: data.error || "An error occurred." },
        ]);
        return;
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.answer || "",
          results: data.results,
          followUpSuggestions: data.followUpSuggestions,
        },
      ]);
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "",
          error: err instanceof Error ? err.message : "Network error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col border rounded-lg bg-card overflow-hidden h-full"
      style={{ minHeight: "480px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm">Contract Assistant</span>
          {selectedContractName && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[120px]"
              title={selectedContractName}
            >
              · {selectedContractName}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="pt-2 space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Ask anything about your contracts
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
                  {(msg.results?.contracts ?? []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.results!.contracts.map((c) => (
                        <ContractResultCard key={c.id} contract={c} />
                      ))}
                    </div>
                  )}
                  {(msg.results?.obligations ?? []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.results!.obligations.map((o) => (
                        <ObligationResultCard key={o.id} obligation={o} />
                      ))}
                    </div>
                  )}
                  {(msg.followUpSuggestions ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.followUpSuggestions!.map((s) => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          className="text-[11px] px-2 py-0.5 rounded-full border hover:bg-accent transition-colors"
                        >
                          {s}
                        </button>
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
          placeholder="Ask about your contracts…"
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
