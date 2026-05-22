import { z } from "zod";

export const pizzaPresetSchema = z.enum(["cheese", "pepperoni", "beef", "pork", "supreme"]);
export const pizzaLineStatusSchema = z.enum(["incomplete", "complete"]);

export const pizzaLineSchema = z.object({
  lineId: z.string().min(1),
  quantity: z.number().int().positive(),
  preset: pizzaPresetSchema.optional(),
  size: z.string().optional(),
  crust: z.string().optional(),
  toppings: z.array(z.string()).default([]),
  status: pizzaLineStatusSchema.default("incomplete"),
  customerLabel: z.string().optional()
});

export const sessionStateSchema = z.object({
  fulfillmentType: z.union([z.literal("pickup"), z.literal("delivery")]).optional(),
  customerName: z.string().optional(),
  phoneNumber: z.string().optional(),
  deliveryAddress: z.string().optional(),
  items: z.array(z.any()).default([]),
  pizzaLines: z.array(pizzaLineSchema).default([]),
  activeLineId: z.string().optional(),
  pendingPrompt: z.string().optional(),
  unclearCount: z.number().int().min(0).default(0),
  lastIntent: z.enum(["order_flow", "store_info", "nonsense", "handoff"]).optional(),
  specialInstructions: z.string().optional(),
  finalConfirmation: z.boolean().optional(),
  handoffRequested: z.boolean().default(false)
});

export const sessionSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "handoff_requested", "completed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: sessionStateSchema
});

export const sessionMessageSchema = z.object({
  message: z.string().min(1)
});

export type SessionState = z.infer<typeof sessionStateSchema>;
export type PizzaLine = z.infer<typeof pizzaLineSchema>;
