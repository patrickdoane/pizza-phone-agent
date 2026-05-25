import { describe, expect, it } from "vitest";
import { buildMenuEntityCandidates, resolveMenuEntity } from "../agent/menuEntityResolver.js";

const menu = {
  pizza: {
    sizes: [{ name: "small" }, { name: "medium" }, { name: "large" }],
    crusts: [{ name: "thin" }, { name: "hand-tossed" }, { name: "pan" }],
    toppings: [{ name: "pepperoni" }, { name: "extra cheese" }, { name: "green peppers" }],
    presets: [{ name: "cheese" }, { name: "pepperoni" }, { name: "supreme" }]
  }
};

describe("menu entity resolver", () => {
  const candidates = buildMenuEntityCandidates(menu);

  it("matches exact name with high confidence", () => {
    const result = resolveMenuEntity("pepperoni", candidates.filter((item) => item.kind === "topping"));
    expect(result.status).toBe("match");
    if (result.status !== "match") {
      return;
    }
    expect(result.match.candidate.name).toBe("pepperoni");
    expect(result.match.confidence).toBe("high");
  });

  it("matches prefix with medium or high confidence", () => {
    const result = resolveMenuEntity("pepp", [
      { kind: "topping", name: "pepperoni" },
      { kind: "topping", name: "extra cheese" }
    ]);
    expect(result.status).toBe("match");
    if (result.status !== "match") {
      return;
    }
    expect(result.match.candidate.name).toBe("pepperoni");
  });

  it("matches typo with confidence threshold", () => {
    const result = resolveMenuEntity("peperoni", candidates.filter((item) => item.kind === "topping"));
    expect(result.status).toBe("match");
    if (result.status !== "match") {
      return;
    }
    expect(result.match.candidate.name).toBe("pepperoni");
  });

  it("returns ambiguous when top scores tie", () => {
    const result = resolveMenuEntity("bee", [
      { kind: "topping", name: "beef" },
      { kind: "topping", name: "beet" }
    ]);
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") {
      return;
    }
    expect(result.matches).toHaveLength(2);
    expect(result.matches.some((item) => item.candidate.name === "beef")).toBe(true);
    expect(result.matches.some((item) => item.candidate.name === "beet")).toBe(true);
  });

  it("returns no match for unrelated input", () => {
    const result = resolveMenuEntity("anchovies", candidates.filter((item) => item.kind === "topping"));
    expect(result.status).toBe("no_match");
  });
});
