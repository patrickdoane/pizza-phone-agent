export type MenuEntityKind = "size" | "crust" | "topping" | "preset";

export type MenuEntityCandidate = {
  kind: MenuEntityKind;
  name: string;
};

export type ResolverConfidence = "high" | "medium";

export type ResolverMatch = {
  candidate: MenuEntityCandidate;
  score: number;
  confidence: ResolverConfidence;
};

export type ResolveEntityResult =
  | { status: "match"; match: ResolverMatch }
  | { status: "ambiguous"; matches: ResolverMatch[] }
  | { status: "no_match" };

type ResolverOptions = {
  highConfidenceThreshold?: number;
  mediumConfidenceThreshold?: number;
  tieMargin?: number;
};

const DEFAULT_OPTIONS: Required<ResolverOptions> = {
  highConfidenceThreshold: 88,
  mediumConfidenceThreshold: 72,
  tieMargin: 3
};

export function buildMenuEntityCandidates(menu: {
  pizza: {
    sizes: { name: string }[];
    crusts: { name: string }[];
    toppings: { name: string }[];
    presets?: { name: string }[];
  };
}): MenuEntityCandidate[] {
  return [
    ...menu.pizza.sizes.map((size) => ({ kind: "size" as const, name: size.name })),
    ...menu.pizza.crusts.map((crust) => ({ kind: "crust" as const, name: crust.name })),
    ...menu.pizza.toppings.map((topping) => ({ kind: "topping" as const, name: topping.name })),
    ...(menu.pizza.presets ?? []).map((preset) => ({ kind: "preset" as const, name: preset.name }))
  ];
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }
  const distance = levenshtein(a, b);
  const denominator = Math.max(a.length, b.length);
  return Math.max(0, 1 - distance / denominator);
}

function scoreCandidate(normalizedQuery: string, normalizedName: string): number {
  if (!normalizedQuery || !normalizedName) {
    return 0;
  }
  if (normalizedQuery === normalizedName) {
    return 100;
  }

  const queryTokens = normalizedQuery.split(" ");
  const nameTokens = normalizedName.split(" ");
  const querySet = new Set(queryTokens);
  const overlapCount = nameTokens.filter((token) => querySet.has(token)).length;
  const overlapScore = (overlapCount / Math.max(queryTokens.length, nameTokens.length)) * 70;

  const containsScore = normalizedName.includes(normalizedQuery) ? 88 : normalizedQuery.includes(normalizedName) ? 82 : 0;
  const prefixScore = nameTokens.some((token) => token.startsWith(normalizedQuery)) ? 80 : 0;
  const typoScore = stringSimilarity(normalizedQuery, normalizedName) * 84;

  return Math.round(Math.max(overlapScore, containsScore, prefixScore, typoScore));
}

export function resolveMenuEntity(
  query: string,
  candidates: MenuEntityCandidate[],
  options?: ResolverOptions
): ResolveEntityResult {
  const config = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || candidates.length === 0) {
    return { status: "no_match" };
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(normalizedQuery, normalize(candidate.name))
    }))
    .filter((item) => item.score >= config.mediumConfidenceThreshold)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));

  if (scored.length === 0) {
    return { status: "no_match" };
  }

  const top = scored[0];
  const second = scored[1];
  if (second && top.score - second.score <= config.tieMargin) {
    return {
      status: "ambiguous",
      matches: [top, second].map((item) => ({
        candidate: item.candidate,
        score: item.score,
        confidence: item.score >= config.highConfidenceThreshold ? "high" : "medium"
      }))
    };
  }

  return {
    status: "match",
    match: {
      candidate: top.candidate,
      score: top.score,
      confidence: top.score >= config.highConfidenceThreshold ? "high" : "medium"
    }
  };
}
