import { describe, expect, it } from "vitest";
import { validatePizzaConfig, checkDeliveryZone } from "../menu/menuService.js";
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
});
