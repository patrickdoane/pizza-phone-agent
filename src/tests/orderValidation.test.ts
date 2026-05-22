import { describe, expect, it } from "vitest";
import { validatePizzaConfig, checkDeliveryZone, getMenu } from "../menu/menuService.js";
import { createPendingOrder } from "../orders/orderService.js";
import { createSession } from "../sessions/sessionService.js";
import { createTestDb } from "./testDb.js";

describe("order validation", () => {
  it("rejects invalid toppings", () => {
    const db = createTestDb();
    const result = validatePizzaConfig(db, "large", "thin", ["dragonfruit"]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Invalid topping");
    db.close();
  });

  it("rejects delivery outside zone", () => {
    const db = createTestDb();
    const zone = checkDeliveryZone(db, "123 Main St, New York, NY 90210");
    expect(zone.inZone).toBe(false);
    expect(zone.reason).toBe("zip_outside_zone");
    db.close();
  });

  it("creates pending human approval order", () => {
    const db = createTestDb();
    const session = createSession(db);
    const order = createPendingOrder(db, session.id, {
      fulfillmentType: "pickup",
      customerName: "Alex",
      phoneNumber: "555-111-2222",
      items: [{ type: "pizza", quantity: 1, size: "medium", crust: "thin", toppings: ["mushrooms"] }],
      specialInstructions: "Extra napkins",
      finalConfirmation: true
    });
    expect(order.status).toBe("pending_human_approval");
    expect(order.id).toBeTruthy();
    db.close();
  });

  it("supports pan crust and distinct beef/pork toppings", () => {
    const db = createTestDb();
    const valid = validatePizzaConfig(db, "large", "pan", ["cheese", "beef", "pork"]);
    expect(valid.valid).toBe(true);
    db.close();
  });

  it("exposes explicit pizza presets in menu", () => {
    const db = createTestDb();
    const menu = getMenu(db) as { pizza: { presets: { name: string; toppings: string[] }[] } };
    const supreme = menu.pizza.presets.find((preset) => preset.name === "supreme");
    expect(supreme).toBeTruthy();
    expect(supreme?.toppings).toContain("beef");
    expect(supreme?.toppings).toContain("pork");
    db.close();
  });
});
