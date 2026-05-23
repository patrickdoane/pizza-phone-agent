import { afterEach, describe, expect, it, vi } from "vitest";

describe("reply composer", () => {
  afterEach(() => {
    delete process.env.PROBABILISTIC_REPLY_COMPOSER;
    vi.restoreAllMocks();
  });

  it("returns fallback reply when composer is disabled", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "0";
    vi.resetModules();
    const { composeReplyIfEnabled } = await import("../agent/replyComposer.js");

    const result = await composeReplyIfEnabled("pickup", "Would you like pickup or delivery?");
    expect(result.reply).toBe("Would you like pickup or delivery?");
    expect(result.reason).toBe("composer_disabled");
  });

  it("returns fallback reply when pattern is not selected", async () => {
    process.env.PROBABILISTIC_REPLY_COMPOSER = "1";
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { composeReplyIfEnabled } = await import("../agent/replyComposer.js");

    const result = await composeReplyIfEnabled("hello", "Thanks. Your order is created and pending human approval. Order ID: abc");
    expect(result.reply).toContain("Order ID: abc");
    expect(result.reason).toBe("pattern_not_selected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
