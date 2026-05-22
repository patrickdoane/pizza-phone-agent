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

  it("handles grouped pizza shorthand and follows up for size and crust", () => {
    const db = createTestDb();
    const baseState = {
      fulfillmentType: "pickup" as const,
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [],
      pizzaLines: [],
      unclearCount: 0,
      handoffRequested: false
    };

    const grouped = runAgentTurn(db, "s3", "I want 5 pizzas: 3 cheese, 2 supreme", baseState);
    expect(grouped.reply).toContain("What size and crust should I use");
    expect(grouped.state.pizzaLines.length).toBe(2);
    expect(grouped.state.items.length).toBe(0);

    const sized = runAgentTurn(db, "s3", "large pan", grouped.state);
    expect(sized.reply).toContain("Any drinks, wings, or special instructions");
    expect(sized.state.items.length).toBe(2);
    expect(sized.state.items[0]).toMatchObject({ type: "pizza", size: "large", crust: "pan" });
    db.close();
  });

  it("resumes to size/crust prompt when grouped lines are incomplete after store question", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s4", "What time do you close tonight?", {
      fulfillmentType: "pickup",
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [],
      pizzaLines: [
        {
          lineId: "line-1",
          quantity: 3,
          preset: "cheese",
          toppings: ["cheese", "extra cheese"],
          status: "incomplete",
          customerLabel: "3 cheese"
        }
      ],
      unclearCount: 0,
      handoffRequested: false
    });
    expect(result.reply).toContain("Our hours are");
    expect(result.reply).toContain("What size and crust should I use for these pizzas?");
    db.close();
  });
});
