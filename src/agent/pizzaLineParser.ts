import { randomUUID } from "node:crypto";
import { PizzaLine } from "../sessions/sessionSchema.js";

type ParseGroupedOrderResult = {
  lines: PizzaLine[];
  parsedSize?: string;
  parsedCrust?: string;
};

export function parseGroupedPizzaOrder(
  message: string,
  presets: { name: string; toppings: string[] }[],
  sizes: string[],
  crusts: string[]
): ParseGroupedOrderResult | null {
  const lower = message.toLowerCase();
  if (!lower.includes("pizza")) {
    return null;
  }

  const parsedSize = sizes.find((size) => lower.includes(size.toLowerCase()));
  const parsedCrust = crusts.find((crust) => lower.includes(crust.toLowerCase()));

  const presetMap = new Map(presets.map((preset) => [preset.name.toLowerCase(), preset]));
  const presetNames = Array.from(presetMap.keys()).sort((a, b) => b.length - a.length).join("|");
  if (!presetNames) {
    return null;
  }

  const groupRegex = new RegExp(`(\\d+)\\s+(${presetNames})`, "gi");
  const matches = Array.from(message.matchAll(groupRegex));
  if (matches.length === 0) {
    return null;
  }

  const lines = matches
    .map((match) => {
      const quantity = Number(match[1]);
      const presetName = match[2].toLowerCase();
      const preset = presetMap.get(presetName);
      if (!preset || Number.isNaN(quantity) || quantity <= 0) {
        return null;
      }
      return {
        lineId: randomUUID(),
        quantity,
        preset: preset.name as PizzaLine["preset"],
        size: parsedSize,
        crust: parsedCrust,
        toppings: [...preset.toppings],
        status: parsedSize && parsedCrust ? "complete" : "incomplete",
        customerLabel: `${quantity} ${preset.name}`
      } satisfies PizzaLine;
    })
    .filter((line): line is PizzaLine => line !== null);

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
