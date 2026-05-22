import { z } from "zod";

export const pizzaItemSchema = z.object({
  type: z.literal("pizza"),
  quantity: z.number().int().positive(),
  size: z.string(),
  crust: z.string(),
  toppings: z.array(z.string()).default([])
});

export const catalogItemSchema = z.object({
  type: z.union([z.literal("wings"), z.literal("drink")]),
  quantity: z.number().int().positive(),
  id: z.string()
});

export const orderItemSchema = z.union([pizzaItemSchema, catalogItemSchema]);

export const orderDraftBaseSchema = z.object({
  customerName: z.string().min(1),
  phoneNumber: z.string().min(7),
  items: z.array(orderItemSchema).min(1),
  specialInstructions: z.string().default(""),
  couponCode: z.string().optional(),
  finalConfirmation: z.boolean()
});

export const pickupOrderDraftSchema = orderDraftBaseSchema.extend({
  fulfillmentType: z.literal("pickup")
});

export const deliveryOrderDraftSchema = orderDraftBaseSchema.extend({
  fulfillmentType: z.literal("delivery"),
  deliveryAddress: z.string().min(5)
});

export const orderDraftSchema = z.discriminatedUnion("fulfillmentType", [pickupOrderDraftSchema, deliveryOrderDraftSchema]);

export const pricedOrderSchema = z.object({
  subtotal: z.number(),
  discount: z.number(),
  tax: z.number(),
  total: z.number(),
  appliedCoupon: z.string().nullable(),
  lines: z.array(z.object({ description: z.string(), quantity: z.number(), lineTotal: z.number() }))
});

export const pendingOrderSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: z.literal("pending_human_approval"),
  draft: orderDraftSchema,
  pricing: pricedOrderSchema
});

export type OrderDraft = z.infer<typeof orderDraftSchema>;
export type PendingOrder = z.infer<typeof pendingOrderSchema>;
