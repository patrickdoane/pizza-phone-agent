const aliasReplacements: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bhand[\s-]?tossed\b/g, value: "hand-tossed" },
  { pattern: /\bhand[\s-]?toss\b/g, value: "hand-tossed" },
  { pattern: /\bpepperonis\b/g, value: "pepperoni" },
  { pattern: /\bpepp\b/g, value: "pepperoni" },
  { pattern: /\bpep\b/g, value: "pepperoni" }
];

export function normalizePizzaAliasText(input: string): string {
  let normalized = input.toLowerCase();
  for (const { pattern, value } of aliasReplacements) {
    normalized = normalized.replace(pattern, value);
  }
  return normalized;
}
