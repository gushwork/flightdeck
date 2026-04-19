import { NextRequest } from "next/server";
import { streamAgentChat, type ChatMessage } from "@/lib/agent/engine";
import { systemPrompts } from "@/lib/agent/prompts";
import { getRegion, parseProfileParam } from "@/lib/aws/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const {
      messages,
      page,
      region: regionBody,
      profile: profileBody,
      model,
    } = body as {
      messages: ChatMessage[];
      page: string;
      region?: string;
      profile?: string;
      model?: string;
    };

    if (!Array.isArray(messages)) {
      return Response.json({ error: "messages must be an array" }, { status: 400 });
    }

    const awsContext = {
      region: getRegion(regionBody),
      profile: parseProfileParam(profileBody),
    };

    const systemPrompt = systemPrompts[page] || systemPrompts.general;

    const systemMessage: ChatMessage = {
      role: "system",
      content: systemPrompt,
    };

    const fullMessages: ChatMessage[] = [systemMessage, ...messages];

    const stream = await streamAgentChat(fullMessages, awsContext, model);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Agent chat error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 },
    );
  }
}
