import { config } from "../config.js";

export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

export async function chatWithOllama(messages: ChatMessage[]): Promise<string> {
  const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      messages
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status}`);
  }
  const json = (await response.json()) as { message?: { content?: string } };
  return json.message?.content ?? "";
}
