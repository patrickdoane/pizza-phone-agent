import { config } from "../config.js";
import { chatWithOllama } from "./llmClient.js";

const SELECTED_REPLY_PATTERNS = [
  /^Our hours are /,
  /^We are at /,
  /^You can reach the store at /,
  /^Would you like pickup or delivery\?/,
  /^What name should I put on the order\?/,
  /^What is the best phone number for this order\?/,
  /^Please share your delivery address including ZIP code\./,
  /^What would you like to order today\?/,
  /^What size and crust should I use for these pizzas\?/,
  /^Would you like to place this order\?/,
  /^No problem\./
];

function shouldCompose(fallbackReply: string): boolean {
  return SELECTED_REPLY_PATTERNS.some((pattern) => pattern.test(fallbackReply));
}

function buildComposerPrompt(userMessage: string, fallbackReply: string): string {
  return [
    "Rewrite the assistant reply to sound natural and concise for a phone call.",
    "Do not add or change facts, prices, items, coupons, policies, or decisions.",
    "Keep the same meaning and next-step question.",
    "Return plain text only.",
    `Customer message: ${userMessage}`,
    `Assistant fallback reply: ${fallbackReply}`
  ].join("\n");
}

export type ComposeReplyResult = {
  reply: string;
  composed: boolean;
  reason: "composer_disabled" | "pattern_not_selected" | "llm_error" | "empty_draft" | "draft_too_long" | "composed";
};

export async function composeReplyIfEnabled(userMessage: string, fallbackReply: string): Promise<ComposeReplyResult> {
  if (!config.probabilisticReplyComposer || !shouldCompose(fallbackReply)) {
    return {
      reply: fallbackReply,
      composed: false,
      reason: config.probabilisticReplyComposer ? "pattern_not_selected" : "composer_disabled"
    };
  }

  try {
    const drafted = await chatWithOllama([
      {
        role: "system",
        content: "You are a careful call-center wording assistant. Preserve facts exactly and keep replies brief."
      },
      {
        role: "user",
        content: buildComposerPrompt(userMessage, fallbackReply)
      }
    ]);

    const cleaned = drafted.trim();
    if (!cleaned) {
      return { reply: fallbackReply, composed: false, reason: "empty_draft" };
    }
    if (cleaned.length > 260) {
      return { reply: fallbackReply, composed: false, reason: "draft_too_long" };
    }
    return { reply: cleaned, composed: true, reason: "composed" };
  } catch {
    return { reply: fallbackReply, composed: false, reason: "llm_error" };
  }
}
