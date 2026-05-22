import { describe, expect, it } from "vitest";
import { buildTools } from "../agent/tools.js";
import { getMenu, seedMenu } from "../menu/menuService.js";
import { createTestDb } from "./testDb.js";

describe("menu snapshot migration", () => {
  it("upgrades legacy snapshot missing store info", () => {
    const db = createTestDb();
    const legacyMenu = getMenu(db) as Record<string, unknown>;
    const { store: _store, ...withoutStore } = legacyMenu;

    db.prepare("UPDATE menu_snapshot SET payload = ? WHERE id = 1").run(JSON.stringify(withoutStore));

    seedMenu(db);
    const migrated = getMenu(db) as { store?: { name?: string } };
    expect(migrated.store?.name).toBeTruthy();
    db.close();
  });

  it("falls back to default store info when legacy payload is still loaded", () => {
    const db = createTestDb();
    const legacyMenu = getMenu(db) as Record<string, unknown>;
    const { store: _store, ...withoutStore } = legacyMenu;

    db.prepare("UPDATE menu_snapshot SET payload = ? WHERE id = 1").run(JSON.stringify(withoutStore));

    const tools = buildTools(db);
    const storeInfo = tools.getStoreInfo();
    expect(storeInfo.name).toBe("Pizza Phone");
    expect(storeInfo.hours.monThu).toBeTruthy();
    db.close();
  });

  it("upgrades legacy snapshot with store but without latest menu version", () => {
    const db = createTestDb();
    const legacyMenu = getMenu(db) as Record<string, unknown>;
    const { version: _version, pizza, ...rest } = legacyMenu;
    const legacyPizza = pizza as { crusts?: unknown[]; toppings?: unknown[] };
    const oldPizza = {
      ...legacyPizza,
      crusts: [{ name: "thin", priceDelta: 0 }, { name: "hand-tossed", priceDelta: 1.5 }, { name: "gluten-free", priceDelta: 2.5 }],
      toppings: (legacyPizza.toppings ?? []).filter(
        (topping) =>
          typeof topping === "object" &&
          topping !== null &&
          !["cheese", "beef", "pork"].includes((topping as { name?: string }).name ?? "")
      )
    };

    const staleSnapshot = { ...rest, pizza: oldPizza };
    db.prepare("UPDATE menu_snapshot SET payload = ? WHERE id = 1").run(JSON.stringify(staleSnapshot));

    seedMenu(db);

    const migrated = getMenu(db) as {
      version?: number;
      pizza: { crusts: { name: string }[]; toppings: { name: string }[]; presets: { name: string }[] };
    };
    expect(migrated.version).toBe(2);
    expect(migrated.pizza.crusts.some((crust) => crust.name === "pan")).toBe(true);
    expect(migrated.pizza.toppings.some((topping) => topping.name === "beef")).toBe(true);
    expect(migrated.pizza.toppings.some((topping) => topping.name === "pork")).toBe(true);
    expect(migrated.pizza.presets.some((preset) => preset.name === "supreme")).toBe(true);
    db.close();
  });
});
