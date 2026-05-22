import { z } from "zod";

export const sessionStateSchema = z.object({
  fulfillmentType: z.union([z.literal("pickup"), z.literal("delivery")]).optional(),
  customerName: z.string().optional(),
  phoneNumber: z.string().optional(),
  deliveryAddress: z.string().optional(),
  items: z.array(z.any()).default([]),
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
