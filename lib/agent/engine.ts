import OpenAI from "openai";
import { agentTools } from "./tools";
import { dispatch, toolResultToString } from "./tool-handlers";
import type { AwsToolContext, ToolResult } from "./tool-handlers";
import { resolveOpenRouterModel } from "./openrouter-model";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const MAX_TOOL_ITERATIONS = 10;

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OpenAI.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
}

interface SSEToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "complete" | "error";
  error?: string;
  result?: string;
}

export async function streamAgentChat(
  messages: ChatMessage[],
  awsContext: AwsToolContext,
  modelFromRequest?: string | null,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const conversationMessages: OpenAI.ChatCompletionMessageParam[] =
    messages.map(toOpenAIMessage);
  const model = resolveOpenRouterModel(modelFromRequest);

  return new ReadableStream({
    async start(controller) {
      try {
        let iterations = 0;

        while (iterations < MAX_TOOL_ITERATIONS) {
          iterations++;

          const response = await client.chat.completions.create({
            model,
            messages: conversationMessages,
            tools: agentTools,
            stream: false,
          });

          const choice = response.choices[0];
          if (!choice) break;

          const toolCalls = choice.message.tool_calls;

          if (toolCalls && toolCalls.length > 0) {
            conversationMessages.push({
              role: "assistant",
              content: choice.message.content ?? null,
              tool_calls: toolCalls,
            });

            for (const toolCall of toolCalls) {
              if (toolCall.type !== "function") continue;
              const toolName = toolCall.function.name;
              let args: Record<string, unknown>;
              try {
                args = JSON.parse(toolCall.function.arguments || "{}");
              } catch {
                args = {};
              }

              emitSSE(controller, encoder, {
                tool_call: { id: toolCall.id, name: toolName, args, status: "running" } satisfies SSEToolCall,
              });

              let result: ToolResult;
              try {
                result = await dispatch(toolName, args, awsContext);
              } catch (err) {
                const errorMsg =
                  err instanceof Error ? err.message : "Tool execution failed";
                emitSSE(controller, encoder, {
                  tool_call: {
                    id: toolCall.id,
                    name: toolName,
                    status: "error",
                    error: errorMsg,
                  } satisfies SSEToolCall,
                });
                conversationMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ error: errorMsg }),
                });
                continue;
              }

              const resultStr = toolResultToString(result);
              const truncatedResult = resultStr.length > 2000
                ? resultStr.slice(0, 2000) + "\n... (truncated)"
                : resultStr;

              emitSSE(controller, encoder, {
                tool_call: {
                  id: toolCall.id,
                  name: toolName,
                  status: "complete",
                  result: truncatedResult,
                } satisfies SSEToolCall,
              });

              if (result.type === "change_plan" && result.plan) {
                emitSSE(controller, encoder, { change_plan: result.plan });
              }

              conversationMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: resultStr,
              });
            }

            continue;
          }

          const textContent = choice.message.content;
          if (textContent) {
            const chunkSize = 12;
            for (let i = 0; i < textContent.length; i += chunkSize) {
              emitSSE(controller, encoder, {
                content: textContent.slice(i, i + chunkSize),
              });
            }
          }

          break;
        }

        if (iterations >= MAX_TOOL_ITERATIONS) {
          emitSSE(controller, encoder, {
            content:
              "\n\n*Reached the maximum number of tool calls. Please ask a more specific question.*",
          });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Unknown error";
        emitSSE(controller, encoder, {
          content: `Error: ${msg}`,
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}

function emitSSE(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  data: Record<string, unknown>,
) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
  );
}

function toOpenAIMessage(
  msg: ChatMessage,
): OpenAI.ChatCompletionMessageParam {
  if (msg.role === "tool") {
    return {
      role: "tool",
      content: msg.content,
      tool_call_id: msg.tool_call_id!,
    };
  }
  if (msg.role === "assistant" && msg.tool_calls) {
    return {
      role: "assistant",
      content: msg.content ? msg.content : null,
      tool_calls: msg.tool_calls,
    };
  }
  if (msg.role === "assistant") {
    return {
      role: "assistant",
      content: msg.content ? msg.content : null,
    };
  }
  return {
    role: msg.role as "system" | "user",
    content: msg.content,
  };
}
