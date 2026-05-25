import { describe, expect, it } from "vitest";
import { applySizeAndCrustToIncompleteLines, parseGroupedPizzaOrder } from "../agent/pizzaLineParser.js";

describe("pizza line parser", () => {
  const presets = [
    { name: "cheese", toppings: ["cheese", "extra cheese"] },
    { name: "supreme", toppings: ["cheese", "pepperoni", "beef", "pork", "green peppers", "onions", "mushrooms"] }
  ];

  it("parses grouped shorthand with immediate preset expansion", () => {
    const result = parseGroupedPizzaOrder(
      "I want 5 pizzas: 3 cheese, 2 supreme",
      presets,
      ["small", "medium", "large"],
      ["thin", "hand-tossed", "pan"]
    );

    expect(result).toBeTruthy();
    expect(result?.lines).toHaveLength(2);
    expect(result?.lines[0].quantity).toBe(3);
    expect(result?.lines[0].toppings).toEqual(["cheese", "extra cheese"]);
    expect(result?.lines[1].quantity).toBe(2);
    expect(result?.lines[1].toppings).toContain("beef");
    expect(result?.lines[1].toppings).toContain("pork");
    expect(result?.lines.every((line) => line.status === "incomplete")).toBe(true);
  });

  it("applies size and crust to incomplete lines", () => {
    const parsed = parseGroupedPizzaOrder("Order is 3 cheese pizzas and 2 supreme pizzas", presets, ["small", "medium", "large"], ["thin", "hand-tossed", "pan"]);
    expect(parsed).toBeTruthy();
    const updated = applySizeAndCrustToIncompleteLines(parsed?.lines ?? [], "large", "pan");
    expect(updated.every((line) => line.size === "large")).toBe(true);
    expect(updated.every((line) => line.crust === "pan")).toBe(true);
    expect(updated.every((line) => line.status === "complete")).toBe(true);
  });

  it("matches hand tossed alias to hand-tossed crust", () => {
    const result = parseGroupedPizzaOrder(
      "I want 2 supreme pizzas hand tossed",
      presets,
      ["small", "medium", "large"],
      ["thin", "hand-tossed", "pan"]
    );
    expect(result).toBeTruthy();
    expect(result?.lines[0].crust).toBe("hand-tossed");
  });
});
