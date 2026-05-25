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

  it("applies a targeted crust edit to one preset line", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s5", "make the supreme pan crust", {
      fulfillmentType: "pickup",
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [
        { type: "pizza", quantity: 3, size: "large", crust: "thin", toppings: ["cheese", "extra cheese"] },
        {
          type: "pizza",
          quantity: 2,
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"]
        }
      ],
      pizzaLines: [
        {
          lineId: "line-1",
          quantity: 3,
          preset: "cheese",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "extra cheese"],
          status: "complete",
          customerLabel: "3 cheese"
        },
        {
          lineId: "line-2",
          quantity: 2,
          preset: "supreme",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"],
          status: "complete",
          customerLabel: "2 supreme"
        }
      ],
      unclearCount: 0,
      handoffRequested: false
    });
    expect(result.reply).toContain("Updated");
    expect(result.state.pizzaLines[0].crust).toBe("thin");
    expect(result.state.pizzaLines[1].crust).toBe("pan");
    db.close();
  });

  it("asks for disambiguation when edit target is unclear", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s6", "make that pan crust", {
      fulfillmentType: "pickup",
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [
        { type: "pizza", quantity: 3, size: "large", crust: "thin", toppings: ["cheese", "extra cheese"] },
        {
          type: "pizza",
          quantity: 2,
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"]
        }
      ],
      pizzaLines: [
        {
          lineId: "line-1",
          quantity: 3,
          preset: "cheese",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "extra cheese"],
          status: "complete",
          customerLabel: "3 cheese"
        },
        {
          lineId: "line-2",
          quantity: 2,
          preset: "supreme",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"],
          status: "complete",
          customerLabel: "2 supreme"
        }
      ],
      unclearCount: 0,
      handoffRequested: false
    });
    expect(result.reply).toContain("Which pizzas should I apply it to");
    db.close();
  });

  it("asks for clarification when requested preset is not in current lines", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s7", "make the pepperoni pan crust", {
      fulfillmentType: "pickup",
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [
        { type: "pizza", quantity: 3, size: "large", crust: "thin", toppings: ["cheese", "extra cheese"] },
        {
          type: "pizza",
          quantity: 2,
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"]
        }
      ],
      pizzaLines: [
        {
          lineId: "line-1",
          quantity: 3,
          preset: "cheese",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "extra cheese"],
          status: "complete",
          customerLabel: "3 cheese"
        },
        {
          lineId: "line-2",
          quantity: 2,
          preset: "supreme",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"],
          status: "complete",
          customerLabel: "2 supreme"
        }
      ],
      unclearCount: 0,
      handoffRequested: false
    });
    expect(result.reply).toContain("do not have any pepperoni pizzas");
    expect(result.reply).toContain("or all pizzas");
    db.close();
  });

  it("removes extra cheese rather than base cheese for overlapping topping names", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s8", "remove extra cheese from all pizzas", {
      fulfillmentType: "pickup",
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [{ type: "pizza", quantity: 1, size: "large", crust: "thin", toppings: ["cheese", "extra cheese"] }],
      pizzaLines: [
        {
          lineId: "line-1",
          quantity: 1,
          preset: "cheese",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "extra cheese"],
          status: "complete",
          customerLabel: "1 cheese"
        }
      ],
      unclearCount: 0,
      handoffRequested: false
    });
    expect(result.state.pizzaLines[0].toppings).toContain("cheese");
    expect(result.state.pizzaLines[0].toppings).not.toContain("extra cheese");
    db.close();
  });

  it("accepts hand toss alias for targeted crust updates", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s9", "make the supreme hand toss", {
      fulfillmentType: "pickup",
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [
        { type: "pizza", quantity: 3, size: "large", crust: "thin", toppings: ["cheese", "extra cheese"] },
        {
          type: "pizza",
          quantity: 2,
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"]
        }
      ],
      pizzaLines: [
        {
          lineId: "line-1",
          quantity: 3,
          preset: "cheese",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "extra cheese"],
          status: "complete",
          customerLabel: "3 cheese"
        },
        {
          lineId: "line-2",
          quantity: 2,
          preset: "supreme",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"],
          status: "complete",
          customerLabel: "2 supreme"
        }
      ],
      unclearCount: 0,
      handoffRequested: false
    });
    expect(result.state.pizzaLines[1].crust).toBe("hand-tossed");
    db.close();
  });

  it("accepts pepp alias for pepperoni topping removal", () => {
    const db = createTestDb();
    const result = runAgentTurn(db, "s10", "remove pepp from all pizzas", {
      fulfillmentType: "pickup",
      customerName: "Jordan",
      phoneNumber: "555-000-1111",
      items: [{ type: "pizza", quantity: 1, size: "large", crust: "thin", toppings: ["cheese", "pepperoni"] }],
      pizzaLines: [
        {
          lineId: "line-1",
          quantity: 1,
          preset: "pepperoni",
          size: "large",
          crust: "thin",
          toppings: ["cheese", "pepperoni"],
          status: "complete",
          customerLabel: "1 pepperoni"
        }
      ],
      unclearCount: 0,
      handoffRequested: false
    });
    expect(result.state.pizzaLines[0].toppings).toContain("cheese");
    expect(result.state.pizzaLines[0].toppings).not.toContain("pepperoni");
    db.close();
  });
});
