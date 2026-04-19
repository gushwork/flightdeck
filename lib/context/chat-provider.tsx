"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
} from "react";
import type {
  ChangePlan,
  PlanExecution,
} from "@/lib/agent/change-plan";

export interface ToolCallEntry {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "complete" | "error";
  error?: string;
  result?: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Stable id for assistant messages (plans, React keys). */
  id?: string;
  toolCalls?: ToolCallEntry[];
}

export interface ParsedPlan {
  plan: ChangePlan;
  execution?: PlanExecution;
}

export interface Conversation {
  messages: ChatMessage[];
  /** Keyed by assistant message `id` (see ChatMessage.id). */
  plans: Map<string, ParsedPlan>;
  greetingSent: boolean;
}

function conversationKey(page: string, entityId?: string | null): string {
  return `${page}:${entityId ?? ""}`;
}

interface ChatContextValue {
  getConversation: (page: string, entityId?: string | null) => Conversation;
  setConversation: (page: string, entityId: string | null | undefined, conv: Conversation) => void;
  clearConversation: (page: string, entityId?: string | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<Map<string, Conversation>>(new Map());

  const getConversation = useCallback(
    (page: string, entityId?: string | null): Conversation => {
      const key = conversationKey(page, entityId);
      const existing = storeRef.current.get(key);
      if (existing) return existing;
      const fresh: Conversation = { messages: [], plans: new Map(), greetingSent: false };
      storeRef.current.set(key, fresh);
      return fresh;
    },
    [],
  );

  const setConversation = useCallback(
    (page: string, entityId: string | null | undefined, conv: Conversation) => {
      const key = conversationKey(page, entityId);
      storeRef.current.set(key, conv);
    },
    [],
  );

  const clearConversation = useCallback(
    (page: string, entityId?: string | null) => {
      const key = conversationKey(page, entityId);
      storeRef.current.delete(key);
    },
    [],
  );

  return (
    <ChatContext.Provider value={{ getConversation, setConversation, clearConversation }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
