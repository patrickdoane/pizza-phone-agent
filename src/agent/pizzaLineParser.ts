import { randomUUID } from "node:crypto";
import { PizzaLine } from "../sessions/sessionSchema.js";
import { MenuEntityCandidate, resolveMenuEntity } from "./menuEntityResolver.js";
import { normalizePizzaAliasText } from "./pizzaAliases.js";

type ParseGroupedOrderResult = {
  lines: PizzaLine[];
  parsedSize?: string;
  parsedCrust?: string;
  clarificationPrompt?: string;
};

export function parseGroupedPizzaOrder(
  message: string,
  presets: { name: string; toppings: string[] }[],
  sizes: string[],
  crusts: string[]
): ParseGroupedOrderResult | null {
  const normalizedMessage = normalizePizzaAliasText(message);
  if (!normalizedMessage.includes("pizza")) {
    return null;
  }

  const parsedSize = sizes.find((size) => normalizedMessage.includes(size.toLowerCase()));
  const parsedCrust = crusts.find((crust) => normalizedMessage.includes(crust.toLowerCase()));

  const presetMap = new Map(presets.map((preset) => [preset.name.toLowerCase(), preset]));
  const presetCandidates: MenuEntityCandidate[] = presets.map((preset) => ({ kind: "preset", name: preset.name }));
  if (presetCandidates.length === 0) {
    return null;
  }

  const normalizedGroups = normalizedMessage.replace(/\b\d+\s+pizzas?\s*:\s*/g, "");
  const groupRegex = /(\d+)\s+([^,]+)/gi;
  const matches = Array.from(normalizedGroups.matchAll(groupRegex));
  if (matches.length === 0) {
    return null;
  }

  const lines: PizzaLine[] = [];
  for (const match of matches) {
    const quantity = Number(match[1]);
    const rawDescriptor = (match[2] ?? "")
      .replace(/\bpizzas?\b/g, "")
      .replace(/\b(and|with)\b.*/g, "")
      .trim();
    if (/\d/.test(rawDescriptor)) {
      continue;
    }
    if (!rawDescriptor || Number.isNaN(quantity) || quantity <= 0) {
      continue;
    }

    let descriptor = rawDescriptor;
    if (parsedSize) {
      descriptor = descriptor.replace(new RegExp(`\\b${parsedSize.toLowerCase()}\\b`, "g"), " ").trim();
    }
    if (parsedCrust) {
      descriptor = descriptor.replace(new RegExp(`\\b${parsedCrust.toLowerCase()}\\b`, "g"), " ").trim();
    }
    descriptor = descriptor.replace(/\s+/g, " ").trim();
    if (!descriptor) {
      continue;
    }

    const exactPreset = presets.find((preset) => descriptor === preset.name.toLowerCase());
    if (exactPreset) {
      lines.push({
        lineId: randomUUID(),
        quantity,
        preset: exactPreset.name as PizzaLine["preset"],
        size: parsedSize,
        crust: parsedCrust,
        toppings: [...exactPreset.toppings],
        status: parsedSize && parsedCrust ? "complete" : "incomplete",
        customerLabel: `${quantity} ${exactPreset.name}`
      });
      continue;
    }

    const resolved = resolveMenuEntity(descriptor, presetCandidates);
    if (resolved.status === "ambiguous") {
      const optionA = resolved.matches[0]?.candidate.name;
      const optionB = resolved.matches[1]?.candidate.name;
      return {
        lines: [],
        parsedSize,
        parsedCrust,
        clarificationPrompt: `I found a couple preset options: ${optionA} or ${optionB}. Which one should I use?`
      };
    }
    if (resolved.status !== "match") {
      continue;
    }
    if (resolved.match.confidence !== "high") {
      return {
        lines: [],
        parsedSize,
        parsedCrust,
        clarificationPrompt: `Did you mean ${resolved.match.candidate.name}?`
      };
    }
    const preset = presetMap.get(resolved.match.candidate.name.toLowerCase());
    if (!preset) {
      continue;
    }

    lines.push({
      lineId: randomUUID(),
      quantity,
      preset: preset.name as PizzaLine["preset"],
      size: parsedSize,
      crust: parsedCrust,
      toppings: [...preset.toppings],
      status: parsedSize && parsedCrust ? "complete" : "incomplete",
      customerLabel: `${quantity} ${preset.name}`
    });
  }

  if (lines.length === 0) {
    return null;
  }

  return { lines, parsedSize, parsedCrust };
}

export function applySizeAndCrustToIncompleteLines(lines: PizzaLine[], size?: string, crust?: string): PizzaLine[] {
  if (!size && !crust) {
    return lines;
  }
  return lines.map((line) => {
    const nextSize = line.size ?? size;
    const nextCrust = line.crust ?? crust;
    return {
      ...line,
      size: nextSize,
      crust: nextCrust,
      status: nextSize && nextCrust ? "complete" : "incomplete"
    };
  });
}
