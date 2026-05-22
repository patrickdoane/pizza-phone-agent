import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

type ScorecardRow = {
  runId: string;
  outcome: string;
  turns: number;
  safetyViolations: number;
};

type RunMetrics = {
  runId: string;
  successRate: number;
  medianTurns: number;
  safetyViolations: number;
  scenarioCount: number;
};

type MetricsPayload = {
  generatedAt: string;
  runs: RunMetrics[];
};

const RUNS_DIR = process.env.EVAL_RUNS_DIR ?? path.join("docs", "runs");
const OUTPUT_PATH = process.env.SCORECARD_METRICS_PATH ?? path.join("public", "metrics.json");

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function loadScorecardRows(filePath: string): Promise<ScorecardRow[]> {
  const raw = await readFile(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }
  const header = parseCsvLine(lines[0]);
  const index = {
    runId: header.indexOf("run_id"),
    outcome: header.indexOf("outcome"),
    turns: header.indexOf("turns"),
    safety: header.indexOf("safety_violations")
  };

  if (Object.values(index).some((idx) => idx < 0)) {
    throw new Error(`Scorecard missing required columns in ${filePath}`);
  }

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      runId: cols[index.runId],
      outcome: cols[index.outcome],
      turns: Number(cols[index.turns] ?? 0),
      safetyViolations: Number(cols[index.safety] ?? 0)
    };
  });
}

async function buildMetrics(): Promise<MetricsPayload> {
  let runDirs: string[] = [];
  try {
    runDirs = await readdir(RUNS_DIR);
  } catch {
    return { generatedAt: new Date().toISOString(), runs: [] };
  }

  const runs: RunMetrics[] = [];
  for (const runDir of runDirs.sort()) {
    const scorecardPath = path.join(RUNS_DIR, runDir, "scorecard.csv");
    try {
      const rows = await loadScorecardRows(scorecardPath);
      if (rows.length === 0) {
        continue;
      }
      const successCount = rows.filter((row) => row.outcome.toLowerCase() === "success").length;
      const safetyViolations = rows.reduce((sum, row) => sum + row.safetyViolations, 0);
      const runId = rows[0].runId || runDir;
      runs.push({
        runId,
        successRate: Number(((successCount / rows.length) * 100).toFixed(1)),
        medianTurns: median(rows.map((row) => row.turns)),
        safetyViolations,
        scenarioCount: rows.length
      });
    } catch {
      continue;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    runs
  };
}

async function main(): Promise<void> {
  const payload = await buildMetrics();
  const outputDir = path.dirname(OUTPUT_PATH);
  await mkdir(outputDir, { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`Wrote ${payload.runs.length} run(s) to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
