import Database from "better-sqlite3";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { buildTools } from "./tools.js";
import { SessionState } from "../sessions/sessionSchema.js";
import { orderDraftSchema } from "../orders/orderSchema.js";
import { applySizeAndCrustToIncompleteLines, parseGroupedPizzaOrder } from "./pizzaLineParser.js";

export const GREETING = "Thanks for calling. I’m an AI assistant that can help take your order. Would you like pickup or delivery?";

type AgentTurnResult = {
  reply: string;
  state: SessionState;
  pendingOrderId?: string;
  handoffRequested?: boolean;
};

type StoreInfo = {
  name: string;
  phone: string;
  address: string;
  hours: { monThu: string; friSat: string; sunday: string };
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

function buildResumePrompt(state: SessionState): string {
  if (!state.fulfillmentType) {
    return "Would you like pickup or delivery?";
  }
  if (!state.customerName) {
    return "What name should I put on the order?";
  }
  if (!state.phoneNumber) {
    return "What is the best phone number for this order?";
  }
  if (state.fulfillmentType === "delivery" && !state.deliveryAddress) {
    return "Please share your delivery address including ZIP code.";
  }
  if ((state.pizzaLines ?? []).some((line) => line.status !== "complete")) {
    return "What size and crust should I use for these pizzas?";
  }
  if ((!state.items || state.items.length === 0) && (!state.pizzaLines || state.pizzaLines.length === 0)) {
    return "What would you like to order today?";
  }
  if (!state.specialInstructions) {
    return "Any special instructions for the kitchen?";
  }
  if (!state.finalConfirmation) {
    return "Would you like to place this order?";
  }
  return "Your order is already pending human approval.";
}

function summarizePizzaLines(state: SessionState): string {
  const lines = state.pizzaLines ?? [];
  if (lines.length === 0) {
    return "";
  }
  return lines
    .map((line) => `${line.quantity} ${line.preset ?? "custom"}${line.quantity === 1 ? " pizza" : " pizzas"}`)
    .join(", ");
}

function toOrderItemsFromPizzaLines(state: SessionState) {
  return (state.pizzaLines ?? []).map((line) => ({
    type: "pizza" as const,
    quantity: line.quantity,
    size: line.size ?? "",
    crust: line.crust ?? "",
    toppings: line.toppings
  }));
}

function parseSizeAndCrust(message: string, sizes: string[], crusts: string[]): { size?: string; crust?: string } {
  const lower = message.toLowerCase();
  const size = sizes.find((item) => lower.includes(item.toLowerCase()));
  const crust = crusts.find((item) => lower.includes(item.toLowerCase()));
  return { size, crust };
}

function maybeAnswerStoreQuestion(lower: string, store: StoreInfo, state: SessionState): string | null {
  const asksHours = lower.includes("hour") || lower.includes("close") || lower.includes("open");
  if (asksHours) {
    return `Our hours are Mon-Thu ${store.hours.monThu}, Fri-Sat ${store.hours.friSat}, and Sun ${store.hours.sunday}. ${buildResumePrompt(state)}`;
  }
  const asksAddress = lower.includes("address") || lower.includes("located") || lower.includes("location") || lower.includes("where are");
  if (asksAddress) {
    return `We are at ${store.address}. ${buildResumePrompt(state)}`;
  }
  const asksPhone =
    (lower.includes("phone") || lower.includes("number") || lower.includes("call back") || lower.includes("callback")) &&
    (lower.includes("store") || lower.includes("your") || lower.includes("you") || lower.includes("contact"));
  if (asksPhone) {
    return `You can reach the store at ${store.phone}. ${buildResumePrompt(state)}`;
  }
  return null;
}

export function runAgentTurn(db: Database.Database, sessionId: string, message: string, state: SessionState): AgentTurnResult {
  const tools = buildTools(db);
  const menu = tools.getMenu() as {
    coupons: { code: string }[];
    pizza: {
      sizes: { name: string }[];
      crusts: { name: string }[];
      presets?: { name: string; toppings: string[] }[];
    };
  };
  const store = tools.getStoreInfo() as StoreInfo;
  const nextState: SessionState = {
    ...state,
    items: state.items ?? [],
    pizzaLines: state.pizzaLines ?? [],
    unclearCount: state.unclearCount ?? 0,
    handoffRequested: state.handoffRequested ?? false
  };
  const lower = message.toLowerCase();

  const storeReply = maybeAnswerStoreQuestion(lower, store, nextState);
  if (storeReply) {
    return { reply: storeReply, state: nextState };
  }

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

  if (nextState.pizzaLines.length > 0 && nextState.items.length === 0) {
    const parsed = parseSizeAndCrust(
      message,
      menu.pizza.sizes.map((size) => size.name),
      menu.pizza.crusts.map((crust) => crust.name)
    );
    nextState.pizzaLines = applySizeAndCrustToIncompleteLines(nextState.pizzaLines, parsed.size, parsed.crust);

    if (nextState.pizzaLines.some((line) => line.status !== "complete")) {
      return {
        reply: `I have ${summarizePizzaLines(nextState)}. Please share one size and one crust for these pizzas, for example large thin.`,
        state: nextState
      };
    }

    nextState.items = toOrderItemsFromPizzaLines(nextState);
    return {
      reply: `Great, I have ${summarizePizzaLines(nextState)}. Any drinks, wings, or special instructions?`,
      state: nextState
    };
  }

  if (nextState.items.length === 0) {
    const grouped = parseGroupedPizzaOrder(
      message,
      menu.pizza.presets ?? [],
      menu.pizza.sizes.map((size) => size.name),
      menu.pizza.crusts.map((crust) => crust.name)
    );
    if (grouped) {
      nextState.pizzaLines = grouped.lines;
      nextState.items = [];

      if (grouped.lines.every((line) => line.status === "complete")) {
        nextState.items = toOrderItemsFromPizzaLines(nextState);
        return {
          reply: `Added ${summarizePizzaLines(nextState)}. Any drinks, wings, or special instructions?`,
          state: nextState
        };
      }

      return {
        reply: `Added ${summarizePizzaLines(nextState)}. What size and crust should I use for these pizzas?`,
        state: nextState
      };
    }

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
