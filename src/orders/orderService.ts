import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { OrderDraft, pendingOrderSchema } from "./orderSchema.js";
import { priceOrder } from "../menu/pricingService.js";
import { checkDeliveryZone } from "../menu/menuService.js";

const now = () => new Date().toISOString();

export function createPendingOrder(db: Database.Database, sessionId: string, draft: OrderDraft) {
  const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  if (!draft.finalConfirmation) {
    throw new Error("Order requires final confirmation before creation");
  }
  if (draft.fulfillmentType === "delivery") {
    const zone = checkDeliveryZone(db, draft.deliveryAddress);
    if (!zone.inZone) {
      throw new Error(`Delivery unavailable: ${zone.reason}`);
    }
  }
  const pricing = priceOrder(db, draft);
  const id = randomUUID();
  const ts = now();
  const payload = { draft, pricing };
  db.prepare("INSERT INTO orders (id, session_id, status, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    sessionId,
    "pending_human_approval",
    JSON.stringify(payload),
    ts,
    ts
  );
  return pendingOrderSchema.parse({ id, sessionId, status: "pending_human_approval", draft, pricing });
}

export function updateOrderStatus(db: Database.Database, orderId: string, status: "approved" | "rejected") {
  const row = db.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);
  if (!row) {
    throw new Error("Order not found");
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), orderId);
  return { id: orderId, status };
}
