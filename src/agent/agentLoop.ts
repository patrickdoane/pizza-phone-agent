import Database from "better-sqlite3";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { buildTools } from "./tools.js";
import { SessionState, SessionStateInput, sessionStateSchema } from "../sessions/sessionSchema.js";
import { orderDraftSchema } from "../orders/orderSchema.js";
import { applySizeAndCrustToIncompleteLines, parseGroupedPizzaOrder } from "./pizzaLineParser.js";
import { MenuEntityCandidate, resolveMenuEntity } from "./menuEntityResolver.js";
import { normalizePizzaAliasText } from "./pizzaAliases.js";
import { randomUUID } from "node:crypto";

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

type PizzaEditSubtopic = "size" | "crust" | "toppings";

type ParsedPizzaEdit = {
  subtopic: PizzaEditSubtopic;
  value?: string;
  mode?: "add" | "remove";
  targetPreset?: string;
  targetAll: boolean;
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

function buildGroupedLineFromPreset(
  quantity: number,
  presetName: string,
  presetToppings: string[],
  size?: string,
  crust?: string
) {
  return {
    lineId: randomUUID(),
    quantity,
    preset: presetName as SessionState["pizzaLines"][number]["preset"],
    size,
    crust,
    toppings: [...presetToppings],
    status: size && crust ? ("complete" as const) : ("incomplete" as const),
    customerLabel: `${quantity} ${presetName}`
  };
}

function parseSizeAndCrust(message: string, sizes: string[], crusts: string[]): { size?: string; crust?: string } {
  const lower = normalizePizzaAliasText(message);
  const size = sizes.find((item) => lower.includes(item.toLowerCase()));
  const crust = crusts.find((item) => lower.includes(item.toLowerCase()));
  return { size, crust };
}

function resolveEntityFromMessage(message: string, candidates: MenuEntityCandidate[]): ReturnType<typeof resolveMenuEntity> {
  const normalized = normalizePizzaAliasText(message);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const queries = new Set<string>();
  queries.add(normalized);
  for (let i = 0; i < tokens.length; i += 1) {
    queries.add(tokens[i]);
    if (i + 1 < tokens.length) {
      queries.add(`${tokens[i]} ${tokens[i + 1]}`);
    }
    if (i + 2 < tokens.length) {
      queries.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
  }

  let best: ReturnType<typeof resolveMenuEntity> = { status: "no_match" };
  for (const query of queries) {
    const result = resolveMenuEntity(query, candidates);
    if (result.status === "match") {
      if (best.status !== "match" || result.match.score > best.match.score) {
        best = result;
      }
      continue;
    }
    if (result.status === "ambiguous" && best.status === "no_match") {
      best = result;
    }
  }
  return best;
}

function parsePizzaEdit(
  message: string,
  sizes: string[],
  crusts: string[],
  presets: { name: string; toppings: string[] }[],
  toppings: string[]
): ParsedPizzaEdit | null {
  const lower = normalizePizzaAliasText(message);
  const parsedSize = sizes.find((item) => lower.includes(item.toLowerCase()));
  const parsedCrust = crusts.find((item) => lower.includes(item.toLowerCase()));
  const mentionsAdd = lower.includes("add ");
  const mentionsRemove =
    lower.includes("remove ") || lower.includes("without ") || lower.includes("no ") || lower.includes("hold ");
  const isToppingEditIntent = mentionsAdd || mentionsRemove || lower.includes("topping");
  const parsedTopping = isToppingEditIntent
    ? [...toppings].sort((a, b) => b.length - a.length).find((item) => lower.includes(item.toLowerCase()))
    : undefined;

  const subtopics = [Boolean(parsedSize), Boolean(parsedCrust), Boolean(parsedTopping || mentionsAdd || mentionsRemove)].filter(Boolean).length;
  if (subtopics !== 1) {
    return null;
  }

  const targetPreset = presets.find((preset) => lower.includes(preset.name.toLowerCase()))?.name;
  const targetAll =
    lower.includes("all pizzas") ||
    lower.includes("all of them") ||
    lower.includes("every pizza") ||
    lower.includes("everything");

  if (parsedSize) {
    return { subtopic: "size", value: parsedSize, targetPreset, targetAll };
  }
  if (parsedCrust) {
    return { subtopic: "crust", value: parsedCrust, targetPreset, targetAll };
  }
  if (!parsedTopping) {
    return null;
  }
  return {
    subtopic: "toppings",
    value: parsedTopping,
    mode: mentionsRemove ? "remove" : "add",
    targetPreset,
    targetAll
  };
}

function resolveLineTargets(
  lines: SessionState["pizzaLines"],
  edit: ParsedPizzaEdit
): { targetLineIds: Set<string>; ambiguous: boolean; missingPresetTarget?: string } {
  if (lines.length === 0) {
    return { targetLineIds: new Set(), ambiguous: false };
  }
  if (edit.targetAll || lines.length === 1) {
    return { targetLineIds: new Set(lines.map((line) => line.lineId)), ambiguous: false };
  }
  if (edit.targetPreset) {
    const matched = lines.filter((line) => line.preset?.toLowerCase() === edit.targetPreset?.toLowerCase());
    if (matched.length === 0) {
      return { targetLineIds: new Set(), ambiguous: false, missingPresetTarget: edit.targetPreset };
    }
    return { targetLineIds: new Set(matched.map((line) => line.lineId)), ambiguous: false };
  }
  return { targetLineIds: new Set(), ambiguous: true };
}

function applyPizzaEditToLines(lines: SessionState["pizzaLines"], edit: ParsedPizzaEdit, targetLineIds: Set<string>): SessionState["pizzaLines"] {
  return lines.map((line) => {
    if (!targetLineIds.has(line.lineId)) {
      return line;
    }
    if (edit.subtopic === "size") {
      const nextSize = edit.value ?? line.size;
      return {
        ...line,
        size: nextSize,
        status: nextSize && line.crust ? "complete" : "incomplete"
      };
    }
    if (edit.subtopic === "crust") {
      const nextCrust = edit.value ?? line.crust;
      return {
        ...line,
        crust: nextCrust,
        status: line.size && nextCrust ? "complete" : "incomplete"
      };
    }

    const current = new Set(line.toppings);
    if (edit.mode === "remove") {
      current.delete(edit.value ?? "");
    } else {
      current.add(edit.value ?? "");
    }
    return { ...line, toppings: Array.from(current) };
  });
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

export function runAgentTurn(db: Database.Database, sessionId: string, message: string, state: SessionStateInput): AgentTurnResult {
  const tools = buildTools(db);
  const menu = tools.getMenu() as {
    coupons: { code: string }[];
    pizza: {
      sizes: { name: string }[];
      crusts: { name: string }[];
      toppings: { name: string }[];
      presets?: { name: string; toppings: string[] }[];
    };
  };
  const store = tools.getStoreInfo() as StoreInfo;
  const nextState: SessionState = sessionStateSchema.parse({
    ...state,
    items: state.items ?? [],
    pizzaLines: state.pizzaLines ?? [],
    unclearCount: state.unclearCount ?? 0,
    handoffRequested: state.handoffRequested ?? false
  });
  const lower = message.toLowerCase();

  if (nextState.pendingResolution?.flow === "grouped_order") {
    const pending = nextState.pendingResolution;
    const normalized = normalizePizzaAliasText(message);
    const saysYes = normalized === "yes" || normalized.includes("yes") || normalized.includes("confirm");
    const saysNo = normalized === "no" || normalized.includes("no") || normalized.includes("different");

    let selected: string | undefined;
    if (pending.mode === "confirm") {
      if (saysNo) {
        nextState.pendingResolution = undefined;
        return { reply: "No problem. Which preset should I use for that pizza group?", state: nextState };
      }
      if (saysYes) {
        selected = pending.options[0];
      }
    }
    if (!selected) {
      selected = pending.options.find((option) => normalized.includes(option.toLowerCase()));
    }
    if (!selected) {
      const options = pending.options.join(" or ");
      return { reply: `Please choose one option: ${options}.`, state: nextState };
    }

    const preset = (menu.pizza.presets ?? []).find((item) => item.name.toLowerCase() === selected?.toLowerCase());
    if (!preset) {
      nextState.pendingResolution = undefined;
      return { reply: "I couldn't match that to a preset. Please restate the pizza group.", state: nextState };
    }

    nextState.pendingResolution = undefined;
    nextState.pizzaLines = [
      ...nextState.pizzaLines,
      buildGroupedLineFromPreset(pending.quantity, preset.name, preset.toppings, pending.size, pending.crust)
    ];
    if (nextState.pizzaLines.every((line) => line.status === "complete")) {
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
    const sizeCandidates = menu.pizza.sizes.map((size) => ({ kind: "size" as const, name: size.name }));
    const crustCandidates = menu.pizza.crusts.map((crust) => ({ kind: "crust" as const, name: crust.name }));
    const sizeResolution = resolveEntityFromMessage(message, sizeCandidates);
    const crustResolution = resolveEntityFromMessage(message, crustCandidates);

    if (sizeResolution.status === "ambiguous") {
      return {
        reply: `I found a couple size options: ${sizeResolution.matches[0].candidate.name} or ${sizeResolution.matches[1].candidate.name}. Which one should I use?`,
        state: nextState
      };
    }
    if (crustResolution.status === "ambiguous") {
      return {
        reply: `I found a couple crust options: ${crustResolution.matches[0].candidate.name} or ${crustResolution.matches[1].candidate.name}. Which one should I use?`,
        state: nextState
      };
    }
    if (sizeResolution.status === "match" && sizeResolution.match.confidence === "medium") {
      return { reply: `Did you mean ${sizeResolution.match.candidate.name}?`, state: nextState };
    }
    if (crustResolution.status === "match" && crustResolution.match.confidence === "medium") {
      return { reply: `Did you mean ${crustResolution.match.candidate.name}?`, state: nextState };
    }

    const parsed = parseSizeAndCrust(message, menu.pizza.sizes.map((size) => size.name), menu.pizza.crusts.map((crust) => crust.name));
    const resolvedSize = sizeResolution.status === "match" ? sizeResolution.match.candidate.name : parsed.size;
    const resolvedCrust = crustResolution.status === "match" ? crustResolution.match.candidate.name : parsed.crust;
    nextState.pizzaLines = applySizeAndCrustToIncompleteLines(nextState.pizzaLines, resolvedSize, resolvedCrust);

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
      if (grouped.clarificationPrompt) {
        if (grouped.pendingResolution) {
          nextState.pendingResolution = {
            flow: "grouped_order",
            mode: grouped.pendingResolution.mode,
            quantity: grouped.pendingResolution.quantity,
            options: grouped.pendingResolution.options,
            size: grouped.pendingResolution.size,
            crust: grouped.pendingResolution.crust
          };
        }
        return { reply: grouped.clarificationPrompt, state: nextState };
      }
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

  if (nextState.pizzaLines.length > 0) {
    const edit = parsePizzaEdit(
      message,
      menu.pizza.sizes.map((size) => size.name),
      menu.pizza.crusts.map((crust) => crust.name),
      menu.pizza.presets ?? [],
      menu.pizza.toppings.map((topping) => topping.name)
    );
    if (edit) {
      if (edit.subtopic === "size" && edit.value) {
        const resolved = resolveEntityFromMessage(message, menu.pizza.sizes.map((size) => ({ kind: "size" as const, name: size.name })));
        if (resolved.status === "ambiguous") {
          return {
            reply: `I found a couple size options: ${resolved.matches[0].candidate.name} or ${resolved.matches[1].candidate.name}. Which one should I use?`,
            state: nextState
          };
        }
        if (resolved.status === "match" && resolved.match.confidence === "medium") {
          return { reply: `Did you mean ${resolved.match.candidate.name}?`, state: nextState };
        }
        if (resolved.status === "match") {
          edit.value = resolved.match.candidate.name;
        }
      }
      if (edit.subtopic === "crust" && edit.value) {
        const resolved = resolveEntityFromMessage(message, menu.pizza.crusts.map((crust) => ({ kind: "crust" as const, name: crust.name })));
        if (resolved.status === "ambiguous") {
          return {
            reply: `I found a couple crust options: ${resolved.matches[0].candidate.name} or ${resolved.matches[1].candidate.name}. Which one should I use?`,
            state: nextState
          };
        }
        if (resolved.status === "match" && resolved.match.confidence === "medium") {
          return { reply: `Did you mean ${resolved.match.candidate.name}?`, state: nextState };
        }
        if (resolved.status === "match") {
          edit.value = resolved.match.candidate.name;
        }
      }
      if (edit.subtopic === "toppings" && edit.value) {
        const resolved = resolveEntityFromMessage(message, menu.pizza.toppings.map((topping) => ({ kind: "topping" as const, name: topping.name })));
        if (resolved.status === "ambiguous") {
          return {
            reply: `I found a couple topping options: ${resolved.matches[0].candidate.name} or ${resolved.matches[1].candidate.name}. Which one should I use?`,
            state: nextState
          };
        }
        if (resolved.status === "match" && resolved.match.confidence === "medium") {
          return { reply: `Did you mean ${resolved.match.candidate.name}?`, state: nextState };
        }
        if (resolved.status === "match") {
          edit.value = resolved.match.candidate.name;
        }
      }

      const { targetLineIds, ambiguous, missingPresetTarget } = resolveLineTargets(nextState.pizzaLines, edit);
      if (missingPresetTarget) {
        const options = Array.from(new Set(nextState.pizzaLines.map((line) => line.preset ?? "custom"))).join(", ");
        return {
          reply: `I do not have any ${missingPresetTarget} pizzas in this order yet. Should I apply that change to ${options}, or all pizzas?`,
          state: nextState
        };
      }
      if (ambiguous) {
        const options = Array.from(new Set(nextState.pizzaLines.map((line) => line.preset ?? "custom"))).join(", ");
        return {
          reply: `I can update that. Which pizzas should I apply it to: ${options}, or all pizzas?`,
          state: nextState
        };
      }
      if (targetLineIds.size > 0) {
        nextState.pizzaLines = applyPizzaEditToLines(nextState.pizzaLines, edit, targetLineIds);
        if (nextState.pizzaLines.every((line) => line.status === "complete")) {
          nextState.items = toOrderItemsFromPizzaLines(nextState);
        }
        if (nextState.pizzaLines.some((line) => line.status !== "complete")) {
          return {
            reply: `Updated. I still need size and crust for all pizzas before checkout.`,
            state: nextState
          };
        }
        return {
          reply: `Updated. Anything else you want to change before we place the order?`,
          state: nextState
        };
      }
    }
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
