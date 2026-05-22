import Database from "better-sqlite3";
import { z } from "zod";
import { checkDeliveryZone, findMenuItem, getMenu, validatePizzaConfig } from "../menu/menuService.js";
import { menuSeed } from "../menu/menuSeed.js";
import { priceOrder } from "../menu/pricingService.js";
import { orderDraftSchema } from "../orders/orderSchema.js";
import { createPendingOrder } from "../orders/orderService.js";

export const getMenuInputSchema = z.object({}).strict();
export const getMenuOutputSchema = z.any();
export const getStoreInfoInputSchema = z.object({}).strict();
export const getStoreInfoOutputSchema = z.object({
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  hours: z.object({
    monThu: z.string(),
    friSat: z.string(),
    sunday: z.string()
  })
});

export const findMenuItemInputSchema = z.object({ query: z.string().min(1) });
export const findMenuItemOutputSchema = z.array(z.any());

export const validatePizzaConfigInputSchema = z.object({ size: z.string(), crust: z.string(), toppings: z.array(z.string()) });
export const validatePizzaConfigOutputSchema = z.object({ valid: z.boolean(), errors: z.array(z.string()) });

export const priceOrderInputSchema = z.object({ orderDraft: orderDraftSchema });
export const priceOrderOutputSchema = z.object({
  subtotal: z.number(),
  discount: z.number(),
  tax: z.number(),
  total: z.number(),
  appliedCoupon: z.string().nullable(),
  lines: z.array(z.object({ description: z.string(), quantity: z.number(), lineTotal: z.number() }))
});

export const checkDeliveryZoneInputSchema = z.object({ address: z.string().min(5) });
export const checkDeliveryZoneOutputSchema = z.object({ inZone: z.boolean(), reason: z.string().optional(), zipCode: z.string().optional() });

export const createPendingOrderInputSchema = z.object({ sessionId: z.string(), orderDraft: orderDraftSchema });
export const createPendingOrderOutputSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: z.literal("pending_human_approval"),
  draft: orderDraftSchema,
  pricing: priceOrderOutputSchema
});

export const requestHumanHandoffInputSchema = z.object({ sessionId: z.string(), reason: z.string().min(1) });
export const requestHumanHandoffOutputSchema = z.object({ handoffRequested: z.literal(true), reason: z.string() });

export function buildTools(db: Database.Database) {
  return {
    getMenu: () => getMenuOutputSchema.parse(getMenu(db)),
    getStoreInfo: () => {
      getStoreInfoInputSchema.parse({});
      const menu = getMenu(db) as { store?: unknown };
      return getStoreInfoOutputSchema.parse(menu.store ?? menuSeed.store);
    },
    findMenuItem: (input: unknown) => {
      const parsed = findMenuItemInputSchema.parse(input);
      return findMenuItemOutputSchema.parse(findMenuItem(db, parsed.query));
    },
    validatePizzaConfig: (input: unknown) => {
      const parsed = validatePizzaConfigInputSchema.parse(input);
      return validatePizzaConfigOutputSchema.parse(validatePizzaConfig(db, parsed.size, parsed.crust, parsed.toppings));
    },
    priceOrder: (input: unknown) => {
      const parsed = priceOrderInputSchema.parse(input);
      return priceOrderOutputSchema.parse(priceOrder(db, parsed.orderDraft));
    },
    checkDeliveryZone: (input: unknown) => {
      const parsed = checkDeliveryZoneInputSchema.parse(input);
      return checkDeliveryZoneOutputSchema.parse(checkDeliveryZone(db, parsed.address));
    },
    createPendingOrder: (input: unknown) => {
      const parsed = createPendingOrderInputSchema.parse(input);
      return createPendingOrderOutputSchema.parse(createPendingOrder(db, parsed.sessionId, parsed.orderDraft));
    },
    requestHumanHandoff: (input: unknown) => {
      const parsed = requestHumanHandoffInputSchema.parse(input);
      db.prepare("INSERT INTO handoffs (session_id, reason, created_at) VALUES (?, ?, ?)").run(parsed.sessionId, parsed.reason, new Date().toISOString());
      return requestHumanHandoffOutputSchema.parse({ handoffRequested: true, reason: parsed.reason });
    }
  };
}
