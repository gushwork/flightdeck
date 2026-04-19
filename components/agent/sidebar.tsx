"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import type { ChangePlan } from "@/lib/agent/change-plan";
import {
  planToCliCommands,
  planToJson,
} from "@/lib/agent/change-plan";
import { ChangePlanCard } from "@/components/agent/change-plan-card";
import {
  useChat,
  type ChatMessage,
  type ParsedPlan,
  type ToolCallEntry,
} from "@/lib/context/chat-provider";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { buildMessagesForAgentApi } from "@/lib/agent/chat-client";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODEL_STORAGE_KEY,
} from "@/lib/agent/openrouter-model";

interface AgentSidebarProps {
  page: string;
  entityId?: string | null;
  apiKeyConfigured?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

const TOOL_DISPLAY: Record<string, { label: string; argKey?: string }> = {
  list_secrets: { label: "List secrets" },
  get_secret_metadata: { label: "Get secret metadata", argKey: "secretName" },
  list_analyzers: { label: "List analyzers" },
  list_analyzer_findings: { label: "List analyzer findings" },
  lookup_cloudtrail_events: { label: "CloudTrail lookup", argKey: "resourceName" },
  propose_change: { label: "Propose change" },
};

const SUGGESTIONS: Record<string, string[]> = {
  dashboard: [
    "List secrets without rotation",
    "Summarize secrets health",
    "What Access Analyzer findings exist?",
  ],
  secretsList: [
    "List secrets without rotation",
    "Find stale secrets",
    "Summarize secrets health",
  ],
  secretDetail: [
    "Who accesses this secret?",
    "Check rotation health",
    "Show access policy",
  ],
  secretsSearch: [
    "Explain search results",
    "Find patterns",
    "Summarize findings",
  ],
  analyzer: [
    "Summarize external access risks",
    "List unused IAM findings",
    "What analyzers are enabled?",
  ],
  settings: [
    "How do I set my AWS region?",
    "Where is the API key stored?",
  ],
  iam: [
    "What does cross-account IAM copy do?",
    "How do named AWS profiles map to accounts?",
  ],
};

const GREETINGS: Record<string, string> = {
  dashboard:
    "I can inspect Secrets Manager metadata and Access Analyzer in real time. What should we check?",
  secretsList:
    "I can check your secrets metadata. Ask about rotation, staleness, or tags.",
  secretDetail:
    "I can review this secret's metadata and CloudTrail access patterns.",
  secretsSearch: "I can help you interpret cross-secret search results.",
  analyzer:
    "I can list analyzers and findings. Ask about unused access or external exposure.",
  settings:
    "I can explain how settings (API keys, region) are stored in your browser.",
  iam:
    "I can explain IAM cross-account copy and how profiles relate to accounts. I don't run IAM writes from chat.",
  general:
    "I'm your AWS assistant for secrets and access analysis. Ask anything about the connected account.",
};

function ToolCallList({ toolCalls }: { toolCalls: ToolCallEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  if (toolCalls.length === 0) return null;

  const allDone = toolCalls.every((tc) => tc.status !== "running");
  const hasErrors = toolCalls.some((tc) => tc.status === "error");
  const visibleCalls = expanded ? toolCalls : toolCalls.slice(0, 3);
  const hiddenCount = toolCalls.length - 3;

  function toggleResult(id: string) {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mb-2 rounded-md border border-(--border-subtle) bg-(--bg-field) text-[11px]">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-(--text-muted)">
        {!allDone ? (
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : hasErrors ? (
          <svg className="h-3 w-3 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3.5M8 11h.01" />
          </svg>
        ) : (
          <svg className="h-3 w-3 text-(--success)" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M5.5 8.5L7 10l3.5-4" />
          </svg>
        )}
        <span className="font-medium">
          {allDone
            ? `Used ${toolCalls.length} tool${toolCalls.length > 1 ? "s" : ""}`
            : `Running tools\u2026`}
        </span>
      </div>

      <div className="border-t border-(--border-subtle)">
        {visibleCalls.map((tc) => {
          const display = TOOL_DISPLAY[tc.name] || { label: tc.name };
          const argValue = display.argKey ? tc.args[display.argKey] : null;
          const showingResult = expandedResults.has(tc.id);
          const hasResult = tc.status === "complete" && tc.result != null;

          return (
            <div key={tc.id} className="border-b border-(--border-subtle) last:border-b-0">
              <div
                className={`flex items-center gap-2 px-2.5 py-1.5 ${hasResult ? "cursor-pointer hover:bg-(--bg-surface)" : ""}`}
                onClick={hasResult ? () => toggleResult(tc.id) : undefined}
              >
                {tc.status === "running" && (
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-(--accent)" />
                )}
                {tc.status === "complete" && (
                  <svg className="h-3 w-3 shrink-0 text-(--success)" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.5L5 9l4.5-5" />
                  </svg>
                )}
                {tc.status === "error" && (
                  <svg className="h-3 w-3 shrink-0 text-red-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                )}
                <span className="flex-1 text-(--text-secondary)">
                  {display.label}
                  {argValue != null && (
                    <span className="ml-1 text-(--text-muted)">
                      &middot; {String(argValue)}
                    </span>
                  )}
                </span>
                {hasResult && (
                  <svg
                    className={`h-3 w-3 shrink-0 text-(--text-muted) transition-transform ${showingResult ? "rotate-90" : ""}`}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M4.5 2.5l4 3.5-4 3.5" />
                  </svg>
                )}
                {tc.status === "error" && tc.error && (
                  <span className="truncate text-red-400 max-w-[120px]" title={tc.error}>
                    {tc.error}
                  </span>
                )}
              </div>
              {showingResult && tc.result != null && (
                <div className="max-h-[200px] overflow-auto border-t border-(--border-subtle) bg-(--bg-surface) px-2.5 py-2">
                  <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-(--text-muted)">
                    {typeof tc.result === "string"
                      ? tc.result
                      : JSON.stringify(tc.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {!expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full px-2.5 py-1.5 text-left text-(--text-muted) hover:text-(--text-secondary) transition-colors"
          >
            + {hiddenCount} more tool{hiddenCount > 1 ? "s" : ""}
          </button>
        )}
        {expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(false)}
            className="w-full px-2.5 py-1.5 text-left text-(--text-muted) hover:text-(--text-secondary) transition-colors border-t border-(--border-subtle)"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-(--text-primary)">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.includes("language-");
    return isBlock ? (
      <code className="block my-2 rounded bg-(--bg-field) px-2.5 py-2 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre">
        {children}
      </code>
    ) : (
      <code className="rounded bg-(--bg-field) px-1 py-0.5 font-mono text-[11px]">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-1 text-sm font-semibold text-(--text-primary)">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-1 text-sm font-semibold text-(--text-primary)">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 text-xs font-semibold text-(--text-primary)">{children}</h3>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-(--accent) underline">
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-(--border) pl-2 text-(--text-muted)">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-(--border-subtle)" />,
};

export function AgentSidebar({
  page,
  entityId,
  apiKeyConfigured = true,
  expanded = false,
  onToggleExpand,
}: AgentSidebarProps) {
  const { getConversation, setConversation } = useChat();
  const { region, profile } = useAwsWorkspace();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [greetingSent, setGreetingSent] = useState(false);
  const [plans, setPlans] = useState<Map<string, ParsedPlan>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevPageRef = useRef<string>(page);
  const prevEntityRef = useRef<string | null>(entityId ?? null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const greetingSentRef = useRef(greetingSent);
  greetingSentRef.current = greetingSent;

  function loadOrGreet(p: string, e: string | null | undefined) {
    const conv = getConversation(p, e);
    if (conv.messages.length > 0) {
      setMessages(conv.messages);
      setPlans(conv.plans);
      setGreetingSent(conv.greetingSent);
    } else if (apiKeyConfigured) {
      const greeting = GREETINGS[p] || GREETINGS.general;
      setMessages([{ role: "assistant", content: greeting }]);
      setPlans(new Map());
      setGreetingSent(true);
    }
  }

  // On page/entity change: save old conversation, load new one
  useEffect(() => {
    const prevPage = prevPageRef.current;
    const prevEntity = prevEntityRef.current;
    const pageChanged = prevPage !== page;
    const entityChanged = prevEntity !== (entityId ?? null);

    if (pageChanged || entityChanged) {
      if (abortRef.current) abortRef.current.abort();

      setConversation(prevPage, prevEntity, {
        messages: messagesRef.current,
        plans: plansRef.current,
        greetingSent: greetingSentRef.current,
      });

      setStreaming(false);
      setInput("");
      loadOrGreet(page, entityId);

      prevPageRef.current = page;
      prevEntityRef.current = entityId ?? null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, entityId]);

  // On mount: load initial conversation
  useEffect(() => {
    loadOrGreet(page, entityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to context whenever messages or plans change
  useEffect(() => {
    setConversation(page, entityId, {
      messages,
      plans,
      greetingSent,
    });
  }, [messages, plans, greetingSent, page, entityId, setConversation]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, plans, scrollToBottom]);

  const handleCopyCli = useCallback(
    (messageId: string | undefined) => {
      if (!messageId) return;
      const entry = plans.get(messageId);
      if (entry) navigator.clipboard.writeText(planToCliCommands(entry.plan));
    },
    [plans],
  );

  const handleCopyJson = useCallback(
    (messageId: string | undefined) => {
      if (!messageId) return;
      const entry = plans.get(messageId);
      if (entry) navigator.clipboard.writeText(planToJson(entry.plan));
    },
    [plans],
  );

  const handleReject = useCallback(
    (messageId: string | undefined) => {
      if (!messageId) return;
      setPlans((prev) => {
        const next = new Map(prev);
        next.delete(messageId);
        return next;
      });
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      /** Snapshot before optimistic updates — fixes stale ref dropping the latest user turn. */
      const prior = messagesRef.current;
      const textTrimmed = text.trim();
      const greetingText = GREETINGS[page] || GREETINGS.general;
      const chatHistory = buildMessagesForAgentApi(
        prior,
        textTrimmed,
        greetingText,
      );

      const assistantId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `asst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const userMessage: ChatMessage = { role: "user", content: textTrimmed };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setStreaming(true);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "",
        toolCalls: [],
        id: assistantId,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const modelRaw =
          typeof window !== "undefined"
            ? localStorage.getItem(OPENROUTER_MODEL_STORAGE_KEY)
            : null;
        const model = (modelRaw?.trim() || DEFAULT_OPENROUTER_MODEL).trim();

        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: chatHistory,
            page,
            entityId: entityId ?? null,
            region,
            profile: profile.trim() || undefined,
            model,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              role: "assistant",
              content: `Error: ${err.error || "Something went wrong"}`,
            };
            return updated;
          });
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";
        const collectedToolCalls: ToolCallEntry[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lineParts = buffer.split(/\r?\n/);
          buffer = lineParts.pop() ?? "";

          for (const rawLine of lineParts) {
            const trimmed = rawLine.trim();
            if (!trimmed.startsWith("data:")) continue;

            const payload = trimmed.startsWith("data: ")
              ? trimmed.slice(6).trimStart()
              : trimmed.slice(5).trimStart();
            if (payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload) as {
                content?: string;
                tool_call?: {
                  id: string;
                  name: string;
                  args?: Record<string, unknown>;
                  status: string;
                  error?: string;
                  result?: unknown;
                };
                change_plan?: ChangePlan;
              };

              if (parsed.content) {
                accumulated += parsed.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: accumulated,
                      toolCalls: [...collectedToolCalls],
                    };
                  }
                  return updated;
                });
              }

              if (parsed.tool_call) {
                const tc = parsed.tool_call;
                const existing = collectedToolCalls.findIndex((t) => t.id === tc.id);
                const entry: ToolCallEntry = {
                  id: tc.id,
                  name: tc.name,
                  args: tc.args ?? (existing >= 0 ? collectedToolCalls[existing].args : {}),
                  status: tc.status as ToolCallEntry["status"],
                  error: tc.error,
                  result: tc.result ?? (existing >= 0 ? collectedToolCalls[existing].result : undefined),
                };
                if (existing >= 0) {
                  collectedToolCalls[existing] = entry;
                } else {
                  collectedToolCalls.push(entry);
                }
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: accumulated,
                      toolCalls: [...collectedToolCalls],
                    };
                  }
                  return updated;
                });
              }

              if (parsed.change_plan) {
                const plan = parsed.change_plan;
                setPlans((prev) => {
                  const next = new Map(prev);
                  next.set(assistantId, { plan });
                  return next;
                });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant" && !last.content) {
              updated[updated.length - 1] = {
                ...last,
                content: "*Stopped.*",
              };
            }
            return updated;
          });
          return;
        }
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          };
          return updated;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, page, entityId, region, profile],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const suggestions = SUGGESTIONS[page] || [
    "List secrets without rotation",
    "Find stale secrets",
    "Summarize Access Analyzer findings",
  ];

  if (!apiKeyConfigured) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-(--border-subtle) px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-(--text-muted)" />
            <span className="text-sm font-medium text-(--text-primary)">
              Agent
            </span>
          </div>
          <span className="text-xs text-(--text-muted)">offline</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-xs leading-relaxed text-(--text-muted)">
            Set{" "}
            <code className="rounded bg-(--bg-surface) px-1 py-0.5 font-mono text-[10px]">
              OPENROUTER_API_KEY
            </code>{" "}
            in{" "}
            <code className="rounded bg-(--bg-surface) px-1 py-0.5 font-mono text-[10px]">
              .env.local
            </code>{" "}
            to enable the agent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--border-subtle) px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${streaming ? "bg-(--accent) animate-pulse" : "bg-(--success)"}`} />
          <span className="text-sm font-medium text-(--text-primary)">
            Agent
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-(--text-muted)">
            {streaming ? "working..." : "ready"}
          </span>
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="rounded p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
              title={expanded ? "Collapse panel" : "Expand panel"}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {expanded ? (
                  <path d="M9 1.5H12.5V5M5 12.5H1.5V9M12.5 1.5L8.5 5.5M1.5 12.5L5.5 8.5" />
                ) : (
                  <path d="M1.5 5V1.5H5M9 12.5H12.5V9M1.5 1.5L5.5 5.5M12.5 12.5L8.5 8.5" />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.map((msg, i) => (
          <div key={msg.id ?? `msg-${i}`}>
            <div className={msg.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  msg.role === "user"
                    ? "max-w-[85%] rounded-lg bg-(--accent) px-3 py-2 text-xs leading-relaxed text-white"
                    : "max-w-[95%] text-xs leading-relaxed text-(--text-secondary)"
                }
              >
                {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ToolCallList toolCalls={msg.toolCalls} />
                )}
                {msg.content ? (
                  msg.role === "assistant" ? (
                    <ReactMarkdown components={markdownComponents}>
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )
                ) : streaming && i === messages.length - 1 ? (
                  (() => {
                    const hasTools = msg.toolCalls && msg.toolCalls.length > 0;
                    const toolsStillRunning = hasTools && msg.toolCalls!.some((tc) => tc.status === "running");
                    const toolsDoneNoContent = hasTools && !toolsStillRunning;
                    const noToolsYet = !hasTools;

                    if (toolsDoneNoContent || noToolsYet) {
                      return (
                        <div className="flex items-center gap-2 text-(--text-muted)">
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          <span>{toolsDoneNoContent ? "Thinking..." : "Connecting..."}</span>
                        </div>
                      );
                    }
                    return null;
                  })()
                ) : null}
              </div>
            </div>
            {msg.role === "assistant" && msg.id && plans.has(msg.id) && (
              <div className="mt-2">
                <ChangePlanCard
                  plan={plans.get(msg.id)!.plan}
                  execution={plans.get(msg.id)!.execution}
                  onCopyCli={() => handleCopyCli(msg.id)}
                  onCopyJson={() => handleCopyJson(msg.id)}
                  onReject={() => handleReject(msg.id)}
                />
              </div>
            )}
          </div>
        ))}

        {/* Suggestion chips */}
        {messages.length === 1 && messages[0].role === "assistant" && !streaming && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="rounded-md border border-(--border) bg-(--bg-field) px-2.5 py-1.5 text-[11px] text-(--text-secondary) transition-colors hover:border-(--accent) hover:text-(--accent)"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-(--border-subtle) p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your AWS account..."
          disabled={streaming}
          className="flex-1 rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none disabled:opacity-60"
        />
        {streaming ? (
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setStreaming(false);
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-(--danger) px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="1" y="1" width="8" height="8" rx="1" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--accent) text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L6 8" />
              <path d="M12 2L8 12L6 8L2 6L12 2Z" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
