import { describe, expect, it } from "vitest";
import { runAgentTurn } from "../agent/agentLoop.js";
import { createTestDb } from "./testDb.js";

describe("agent tools behavior", () => {
  it("refuses to invent non-existent coupon", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s1", "Can you apply MEGADEAL99 coupon?", { items: [], handoffRequested: false });
    expect(result.reply.toLowerCase()).toContain("only apply active coupons");
    db.close();
  });

  it("answers hours question and resumes order flow", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s2", "What time do you close tonight?", {
      fulfillmentType: "pickup",
      items: [],
      handoffRequested: false
    });
    expect(result.reply).toContain("Our hours are");
    expect(result.reply).toContain("What name should I put on the order?");
    db.close();
  });
});
