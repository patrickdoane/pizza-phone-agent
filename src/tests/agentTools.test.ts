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
});
