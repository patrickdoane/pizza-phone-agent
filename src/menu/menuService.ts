import Database from "better-sqlite3";
import { z } from "zod";
import { menuSeed } from "./menuSeed.js";

export const pizzaConfigInputSchema = z.object({
  size: z.string(),
  crust: z.string(),
  toppings: z.array(z.string())
});

export const pizzaConfigOutputSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string())
});

export const menuQuerySchema = z.object({ query: z.string().min(1) });

export function initializeDatabase(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      state_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);
}

export function seedMenu(db: Database.Database): void {
  const existing = db.prepare("SELECT payload FROM menu_snapshot WHERE id = 1").get() as { payload: string } | undefined;
  if (!existing) {
    db.prepare("INSERT INTO menu_snapshot (id, payload) VALUES (1, ?)").run(JSON.stringify(menuSeed));
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(existing.payload);
  } catch {
    db.prepare("UPDATE menu_snapshot SET payload = ? WHERE id = 1").run(JSON.stringify(menuSeed));
    return;
  }

  const missingStoreInfo = typeof payload !== "object" || payload === null || !("store" in payload);
  if (missingStoreInfo) {
    db.prepare("UPDATE menu_snapshot SET payload = ? WHERE id = 1").run(JSON.stringify(menuSeed));
  }
}

export function getMenu(db: Database.Database): unknown {
  const row = db.prepare("SELECT payload FROM menu_snapshot WHERE id = 1").get() as { payload: string } | undefined;
  if (!row) {
    throw new Error("Menu is not seeded");
  }
  return JSON.parse(row.payload);
}

export function findMenuItem(db: Database.Database, query: string): unknown[] {
  menuQuerySchema.parse({ query });
  const menu = getMenu(db) as typeof menuSeed;
  const q = query.toLowerCase();
  const items = [
    ...menu.pizza.sizes.map((s) => ({ type: "pizza_size", name: s.name, price: s.basePrice })),
    ...menu.pizza.crusts.map((c) => ({ type: "pizza_crust", name: c.name, priceDelta: c.priceDelta })),
    ...menu.pizza.toppings.map((t) => ({ type: "topping", name: t.name, price: t.price })),
    ...menu.wings.map((w) => ({ type: "wings", name: w.name, price: w.price })),
    ...menu.drinks.map((d) => ({ type: "drink", name: d.name, price: d.price })),
    ...menu.coupons.map((c) => ({ type: "coupon", code: c.code, value: c.value }))
  ];
  return items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
}

export function validatePizzaConfig(db: Database.Database, size: string, crust: string, toppings: string[]): z.infer<typeof pizzaConfigOutputSchema> {
  pizzaConfigInputSchema.parse({ size, crust, toppings });
  const menu = getMenu(db) as typeof menuSeed;
  const errors: string[] = [];
  if (!menu.pizza.sizes.some((s) => s.name === size)) {
    errors.push(`Invalid pizza size: ${size}`);
  }
  if (!menu.pizza.crusts.some((c) => c.name === crust)) {
    errors.push(`Invalid crust: ${crust}`);
  }
  const validToppings = new Set(menu.pizza.toppings.map((t) => t.name));
  for (const topping of toppings) {
    if (!validToppings.has(topping)) {
      errors.push(`Invalid topping: ${topping}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function checkDeliveryZone(db: Database.Database, address: string): { inZone: boolean; reason?: string; zipCode?: string } {
  const menu = getMenu(db) as typeof menuSeed;
  const match = address.match(/\b\d{5}\b/);
  if (!match) {
    return { inZone: false, reason: "zip_missing" };
  }
  const zipCode = match[0];
  const inZone = menu.deliveryZipCodes.includes(zipCode);
  if (!inZone) {
    return { inZone: false, reason: "zip_outside_zone", zipCode };
  }
  return { inZone: true, zipCode };
}
