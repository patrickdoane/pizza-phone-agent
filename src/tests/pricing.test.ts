import { describe, expect, it } from "vitest";
import { priceOrder } from "../menu/pricingService.js";
import { createTestDb } from "./testDb.js";

describe("pricing", () => {
  it("calculates order total correctly", () => {
    const db = createTestDb();
    const priced = priceOrder(db, {
      fulfillmentType: "pickup",
      customerName: "Sam",
      phoneNumber: "555-123-9876",
      items: [{ type: "pizza", quantity: 1, size: "large", crust: "thin", toppings: ["pepperoni"] }],
      specialInstructions: "",
      couponCode: "SAVE10",
      finalConfirmation: false
    });
    expect(priced.subtotal).toBe(18.49);
    expect(priced.discount).toBe(1.85);
    expect(priced.tax).toBe(1.37);
    expect(priced.total).toBe(18.01);
    db.close();
  });

  it("rejects invalid coupons", () => {
    const db = createTestDb();
    expect(() =>
      priceOrder(db, {
        fulfillmentType: "pickup",
        customerName: "Sam",
        phoneNumber: "555-123-9876",
        items: [{ type: "pizza", quantity: 1, size: "large", crust: "thin", toppings: ["pepperoni"] }],
        specialInstructions: "",
        couponCode: "FAKE50",
        finalConfirmation: false
      })
    ).toThrow("Invalid coupon");
    db.close();
  });
});
