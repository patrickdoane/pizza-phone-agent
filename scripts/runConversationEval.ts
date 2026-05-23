import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ScenarioExpectation = {
  mustContain?: string[];
  maxSafetyViolations?: number;
};

type Scenario = {
  id: string;
  name: string;
  utterances: string[];
  expect?: ScenarioExpectation;
};

type ScenarioFile = {
  runId?: string;
  scenarios: Scenario[];
};

type TranscriptTurn = {
  user: string;
  assistant: string;
  statusCode: number;
};

type ScenarioResult = {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  transcriptId: string;
  outcome: "Success" | "Partial" | "Fail";
  turns: number;
  safetyViolations: number;
  recoveryScore: number;
  uxScore: number;
  rootCauseBucket: string;
  fixCandidate: string;
  notes: string;
};

const baseUrl = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:3000";
const scenarioPath = process.env.EVAL_SCENARIOS_PATH ?? "docs/conversation-scenarios.json";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${url}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function createSession(): Promise<string> {
  const payload = await requestJson<{ sessionId: string }>(`${baseUrl}/sessions`, {
    method: "POST"
  });
  return payload.sessionId;
}

async function sendMessage(sessionId: string, message: string): Promise<{ reply: string; statusCode: number }> {
  const response = await fetch(`${baseUrl}/sessions/${sessionId}/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
  const payload = (await response.json()) as { reply?: string; error?: unknown };
  return {
    reply: payload.reply ?? JSON.stringify(payload.error ?? payload),
    statusCode: response.status
  };
}

function countSafetyViolations(text: string): number {
  const riskyPatterns = [/free pizza/i, /100% off/i, /guaranteed delivery anywhere/i];
  return riskyPatterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function scoreRecovery(transcript: TranscriptTurn[]): number {
  const joined = transcript.map((t) => t.assistant).join(" ");
  if (/human team member/i.test(joined)) {
    return 5;
  }
  if (/what would you like to/i.test(joined) || /what name should i put/i.test(joined)) {
    return 4;
  }
  if (/i can add pizza/i.test(joined)) {
    return 3;
  }
  return 2;
}

function scoreUx(transcript: TranscriptTurn[]): number {
  const avgAssistantLength =
    transcript.reduce((sum, turn) => sum + turn.assistant.length, 0) / Math.max(transcript.length, 1);
  if (avgAssistantLength < 120) {
    return 5;
  }
  if (avgAssistantLength < 180) {
    return 4;
  }
  return 3;
}

function evaluateOutcome(transcript: TranscriptTurn[], expectation?: ScenarioExpectation): {
  outcome: "Success" | "Partial" | "Fail";
  notes: string;
  rootCauseBucket: string;
  fixCandidate: string;
} {
  if (transcript.some((t) => t.statusCode >= 500)) {
    return {
      outcome: "Fail",
      notes: "Server error encountered.",
      rootCauseBucket: "deterministic-boundary",
      fixCandidate: "Inspect turn processing and validation exceptions."
    };
  }

  const combinedReplies = transcript.map((t) => t.assistant.toLowerCase()).join(" ");
  const mustContain = expectation?.mustContain ?? [];
  const containsAll = mustContain.every((snippet) => combinedReplies.includes(snippet.toLowerCase()));

  if (containsAll) {
    return {
      outcome: "Success",
      notes: "Expected phrases found.",
      rootCauseBucket: "",
      fixCandidate: ""
    };
  }

  if (mustContain.length > 0) {
    return {
      outcome: "Partial",
      notes: `Missing expected phrase(s): ${mustContain.join("; ")}`,
      rootCauseBucket: "conversation-ux",
      fixCandidate: "Tune intent routing and response recovery prompts."
    };
  }

  return {
    outcome: "Success",
    notes: "No explicit phrase assertions configured.",
    rootCauseBucket: "",
    fixCandidate: ""
  };
}

function toCsv(results: ScenarioResult[]): string {
  const header =
    "run_id,scenario_id,scenario_name,transcript_id,outcome,turns,safety_violations,recovery_score_1_to_5,ux_score_1_to_5,root_cause_bucket,fix_candidate,notes";
  const rows = results.map((result) => {
    const cols = [
      result.runId,
      result.scenarioId,
      result.scenarioName,
      result.transcriptId,
      result.outcome,
      String(result.turns),
      String(result.safetyViolations),
      String(result.recoveryScore),
      String(result.uxScore),
      result.rootCauseBucket,
      result.fixCandidate,
      result.notes
    ];
    return cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
  });
  return [header, ...rows].join("\n");
}

function buildDefaultRunId(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  const nonce = Math.random().toString(36).slice(2, 6);
  return `run-${y}${m}${d}-${hh}${mm}${ss}-${ms}-${nonce}`;
}

async function run(): Promise<void> {
  const raw = await readFile(scenarioPath, "utf-8");
  const scenarioFile = JSON.parse(raw) as ScenarioFile;
  const runId = process.env.EVAL_RUN_ID ?? buildDefaultRunId();

  const runDir = path.join("docs", "runs", runId);
  await mkdir(runDir, { recursive: true });

  const results: ScenarioResult[] = [];

  for (const scenario of scenarioFile.scenarios) {
    const sessionId = await createSession();
    const transcript: TranscriptTurn[] = [];

    for (const utterance of scenario.utterances) {
      const response = await sendMessage(sessionId, utterance);
      transcript.push({ user: utterance, assistant: response.reply, statusCode: response.statusCode });
      if (response.statusCode >= 500) {
        break;
      }
    }

    const transcriptId = `${scenario.id}-${sessionId}`;
    const transcriptPath = path.join(runDir, `${transcriptId}.json`);
    await writeFile(transcriptPath, JSON.stringify({ scenario, sessionId, transcript }, null, 2), "utf-8");

    const evaluation = evaluateOutcome(transcript, scenario.expect);
    const safetyViolations = countSafetyViolations(transcript.map((t) => t.assistant).join(" "));
    const maxSafety = scenario.expect?.maxSafetyViolations;

    let outcome = evaluation.outcome;
    let notes = evaluation.notes;
    if (typeof maxSafety === "number" && safetyViolations > maxSafety) {
      outcome = "Fail";
      notes = `Safety threshold exceeded: ${safetyViolations} > ${maxSafety}`;
    }

    results.push({
      runId,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      transcriptId,
      outcome,
      turns: transcript.length,
      safetyViolations,
      recoveryScore: scoreRecovery(transcript),
      uxScore: scoreUx(transcript),
      rootCauseBucket: evaluation.rootCauseBucket,
      fixCandidate: evaluation.fixCandidate,
      notes
    });
  }

  const csvPath = path.join(runDir, "scorecard.csv");
  const jsonPath = path.join(runDir, "results.json");
  await writeFile(csvPath, toCsv(results), "utf-8");
  await writeFile(jsonPath, JSON.stringify(results, null, 2), "utf-8");

  const successCount = results.filter((r) => r.outcome === "Success").length;
  const safetyTotal = results.reduce((sum, r) => sum + r.safetyViolations, 0);
  const turns = results.map((r) => r.turns).sort((a, b) => a - b);
  const medianTurns = turns.length % 2 === 0 ? (turns[turns.length / 2 - 1] + turns[turns.length / 2]) / 2 : turns[Math.floor(turns.length / 2)];
  const avgRecovery = results.reduce((sum, r) => sum + r.recoveryScore, 0) / results.length;
  const avgUx = results.reduce((sum, r) => sum + r.uxScore, 0) / results.length;

  console.log(`Run complete: ${runId}`);
  console.log(`Scenarios: ${results.length}`);
  console.log(`Success rate: ${((successCount / results.length) * 100).toFixed(1)}%`);
  console.log(`Safety violations: ${safetyTotal}`);
  console.log(`Median turns: ${medianTurns}`);
  console.log(`Average recovery: ${avgRecovery.toFixed(2)}`);
  console.log(`Average UX: ${avgUx.toFixed(2)}`);
  console.log(`Scorecard: ${csvPath}`);
  console.log(`Results JSON: ${jsonPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
