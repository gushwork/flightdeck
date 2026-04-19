import type { ChatMessage } from "@/lib/context/chat-provider";

/** Payload shape sent to `/api/agent/chat` (no system message; server prepends it). */
export type AgentApiMessage = { role: "user" | "assistant"; content: string };

/**
 * Builds the message list for the agent API from the in-memory thread plus the new user turn.
 * Uses `prior` as it was **before** appending the new user message (fixes stale ref / slice bugs).
 */
export function buildMessagesForAgentApi(
  prior: ChatMessage[],
  newUserText: string,
  greetingText: string,
): AgentApiMessage[] {
  const out: AgentApiMessage[] = [];
  const trimmedGreeting = greetingText.trim();
  const skipOnlyGreeting =
    prior.length === 1 &&
    prior[0].role === "assistant" &&
    prior[0].content.trim() === trimmedGreeting;

  for (let i = 0; i < prior.length; i++) {
    if (skipOnlyGreeting && i === 0) continue;

    const m = prior[i];
    if (m.role === "user") {
      const c = m.content.trim();
      if (c) out.push({ role: "user", content: c });
      continue;
    }
    if (m.role === "assistant") {
      const c = m.content.trim();
      if (c) {
        out.push({ role: "assistant", content: c });
      } else if (m.toolCalls && m.toolCalls.length > 0) {
        out.push({
          role: "assistant",
          content: "[Tool results were shown in the panel.]",
        });
      }
    }
  }

  out.push({ role: "user", content: newUserText.trim() });
  return out;
}
