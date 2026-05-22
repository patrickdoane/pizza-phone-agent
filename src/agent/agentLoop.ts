import Database from "better-sqlite3";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { buildTools } from "./tools.js";
import { SessionState } from "../sessions/sessionSchema.js";
import { orderDraftSchema } from "../orders/orderSchema.js";

export const GREETING = "Thanks for calling. I’m an AI assistant that can help take your order. Would you like pickup or delivery?";

type AgentTurnResult = {
  reply: string;
  state: SessionState;
  pendingOrderId?: string;
  handoffRequested?: boolean;
};

function extractPhone(input: string): string | undefined {
  const match = input.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  return match?.[0];
}

export function shouldRefuseCoupon(message: string, availableCoupons: string[]): boolean {
  const couponMatch = message.match(/\b[A-Z0-9]{4,12}\b/g) ?? [];
  return couponMatch.some((token) => token.includes("SAVE") || token.includes("OFF") || token.includes("DEAL"))
    ? !couponMatch.some((token) => availableCoupons.includes(token))
    : false;
}

export function buildInitialPrompt(): string {
  return `${SYSTEM_PROMPT}\n\n${GREETING}`;
}

export function runAgentTurn(db: Database.Database, sessionId: string, message: string, state: SessionState): AgentTurnResult {
  const tools = buildTools(db);
  const menu = tools.getMenu() as { coupons: { code: string }[] };
  const nextState: SessionState = { ...state, items: state.items ?? [], handoffRequested: state.handoffRequested ?? false };
  const lower = message.toLowerCase();

  if (lower.includes("human") || lower.includes("representative")) {
    tools.requestHumanHandoff({ sessionId, reason: "Customer requested human" });
    nextState.handoffRequested = true;
    return { reply: "Absolutely. I can connect you to a human team member now.", state: nextState, handoffRequested: true };
  }

  if (shouldRefuseCoupon(message.toUpperCase(), menu.coupons.map((c) => c.code.toUpperCase()))) {
    return {
      reply: "I can only apply active coupons from our menu. I can check available deals like SAVE10 or WINGS5 if you want.",
      state: nextState
    };
  }

  if (!nextState.fulfillmentType) {
    if (lower.includes("pickup")) {
      nextState.fulfillmentType = "pickup";
      return { reply: "Great, pickup. What name should I put on the order?", state: nextState };
    }
    if (lower.includes("delivery")) {
      nextState.fulfillmentType = "delivery";
      return { reply: "Got it, delivery. What name should I put on the order?", state: nextState };
    }
    return { reply: "Would you like pickup or delivery?", state: nextState };
  }

  if (!nextState.customerName) {
    nextState.customerName = message.trim();
    return { reply: "Thanks. What is the best phone number for this order?", state: nextState };
  }

  if (!nextState.phoneNumber) {
    const phone = extractPhone(message) ?? message.trim();
    nextState.phoneNumber = phone;
    if (nextState.fulfillmentType === "delivery") {
      return { reply: "Please share your delivery address including ZIP code.", state: nextState };
    }
    return { reply: "What would you like to order today?", state: nextState };
  }

  if (nextState.fulfillmentType === "delivery" && !nextState.deliveryAddress) {
    const zone = tools.checkDeliveryZone({ address: message.trim() });
    if (!zone.inZone) {
      return { reply: "Sorry, that ZIP is outside our delivery zone. We can do pickup if you like.", state: nextState };
    }
    nextState.deliveryAddress = message.trim();
    return { reply: "Thanks. What would you like to order today?", state: nextState };
  }

  if (nextState.items.length === 0) {
    if (lower.includes("large") && lower.includes("pizza")) {
      nextState.items.push({ type: "pizza", quantity: 1, size: "large", crust: "thin", toppings: ["pepperoni"] });
      return { reply: "Added one large thin pepperoni pizza. Any drinks, wings, or special instructions?", state: nextState };
    }
    return {
      reply: "I can add pizza, wings, or drinks. For pizza, tell me size, crust, and toppings.",
      state: nextState
    };
  }

  if (!nextState.specialInstructions) {
    nextState.specialInstructions = message.trim();
    const orderDraft = orderDraftSchema.parse({
      fulfillmentType: nextState.fulfillmentType,
      customerName: nextState.customerName,
      phoneNumber: nextState.phoneNumber,
      deliveryAddress: nextState.deliveryAddress,
      items: nextState.items,
      specialInstructions: nextState.specialInstructions,
      finalConfirmation: false
    });
    const priced = tools.priceOrder({ orderDraft });
    return {
      reply: `Your total is $${priced.total.toFixed(2)}. Would you like to place this order?`,
      state: nextState
    };
  }

  if (!nextState.finalConfirmation) {
    if (lower.includes("yes") || lower.includes("confirm") || lower.includes("place")) {
      nextState.finalConfirmation = true;
      const orderDraft = orderDraftSchema.parse({
        fulfillmentType: nextState.fulfillmentType,
        customerName: nextState.customerName,
        phoneNumber: nextState.phoneNumber,
        deliveryAddress: nextState.deliveryAddress,
        items: nextState.items,
        specialInstructions: nextState.specialInstructions,
        finalConfirmation: true
      });
      const order = tools.createPendingOrder({ sessionId, orderDraft });
      return {
        reply: `Thanks. Your order is created and pending human approval. Order ID: ${order.id}`,
        state: nextState,
        pendingOrderId: order.id
      };
    }
    return { reply: "No problem. What would you like to change?", state: nextState };
  }

  return { reply: "Your order is already pending human approval.", state: nextState };
}
