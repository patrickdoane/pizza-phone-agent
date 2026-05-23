import { afterEach, describe, expect, it, vi } from "vitest";

describe("reply composer", () => {
  afterEach(() => {
    delete process.env.PROBABILISTIC_REPLY_COMPOSER;
    delete process.env.PROBABILISTIC_REPLY_COMPOSER_DEBUG;
    vi.resetModules();
    vi.unmock("../agent/llmClient.js");
    vi.restoreAllMocks();
  });

  async function importComposerWithDraft(draft: string) {
    vi.doMock("../agent/llmClient.js", () => ({
      chatWithOllama: vi.fn().mockResolvedValue(draft)
    }));
    return import("../agent/replyComposer.js");
  }

  it("returns fallback reply when composer is disabled", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "0";
    const { composeReplyIfEnabled } = await import("../agent/replyComposer.js");

    const result = await composeReplyIfEnabled("pickup", "Would you like pickup or delivery?");
    expect(result.reply).toBe("Would you like pickup or delivery?");
    expect(result.reason).toBe("composer_disabled");
  });

  it("returns fallback reply when pattern is not selected", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "1";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { composeReplyIfEnabled } = await import("../agent/replyComposer.js");

    const result = await composeReplyIfEnabled("hello", "Thanks. Your order is created and pending human approval. Order ID: abc");
    expect(result.reply).toContain("Order ID: abc");
    expect(result.reason).toBe("pattern_not_selected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects hours drafts that alter required factual tokens", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "1";
    const { composeReplyIfEnabled } = await importComposerWithDraft(
      "Our hours are Mon-Thu 10:00 AM through 10 PM, Fri-Sat 10 AM through 11 PM, and Sun 11 AM through 10 PM."
    );

    const fallback = "Our hours are Mon-Thu 10:00 AM - 10:00 PM, Fri-Sat 10:00 AM - 11:00 PM, and Sun 11:00 AM - 9:00 PM. Would you like pickup or delivery?";
    const result = await composeReplyIfEnabled("what time do you close", fallback);
    expect(result.reply).toBe(fallback);
    expect(result.reason).toBe("fact_guard_failed");
  });

  it("rejects phone drafts that alter required digits", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "1";
    const { composeReplyIfEnabled } = await importComposerWithDraft("You can reach the store at 555-010-9999.");

    const fallback = "You can reach the store at 555-010-1234. Would you like pickup or delivery?";
    const result = await composeReplyIfEnabled("what is your phone number", fallback);
    expect(result.reply).toBe(fallback);
    expect(result.reason).toBe("fact_guard_failed");
  });

  it("rejects address drafts that drop zip code", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "1";
    const { composeReplyIfEnabled } = await importComposerWithDraft("We are at 100 Main St, New York, NY.");

    const fallback = "We are at 100 Main St, New York, NY 10001. What name should I put on the order?";
    const result = await composeReplyIfEnabled("where are you located", fallback);
    expect(result.reply).toBe(fallback);
    expect(result.reason).toBe("fact_guard_failed");
  });

  it("accepts safe hours rewrite when required facts are preserved", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "1";
    const { composeReplyIfEnabled } = await importComposerWithDraft(
      "Our hours are Monday through Thursday 10:00 AM to 10:00 PM, Friday and Saturday 10:00 AM to 11:00 PM, and Sunday 11:00 AM to 9:00 PM. Would you like pickup or delivery?"
    );

    const fallback = "Our hours are Mon-Thu 10:00 AM - 10:00 PM, Fri-Sat 10:00 AM - 11:00 PM, and Sun 11:00 AM - 9:00 PM. Would you like pickup or delivery?";
    const result = await composeReplyIfEnabled("hours please", fallback);
    expect(result.reason).toBe("composed");
    expect(result.reply).toContain("10:00 PM");
  });
});
