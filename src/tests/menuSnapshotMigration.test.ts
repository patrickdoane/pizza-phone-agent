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
});
