import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { sessionSchema, SessionState } from "./sessionSchema.js";

const now = () => new Date().toISOString();

export function createSession(db: Database.Database) {
  const id = randomUUID();
  const ts = now();
  const state: SessionState = { items: [], pizzaLines: [], unclearCount: 0, handoffRequested: false };
  db.prepare("INSERT INTO sessions (id, status, created_at, updated_at, state_json) VALUES (?, ?, ?, ?, ?)").run(
    id,
    "active",
    ts,
    ts,
    JSON.stringify(state)
  );
  const session = getSession(db, id);
  if (!session) {
    throw new Error("Failed to create session");
  }
  return session;
}

export function getSession(db: Database.Database, id: string) {
  const row = db
    .prepare("SELECT id, status, created_at, updated_at, state_json FROM sessions WHERE id = ?")
    .get(id) as { id: string; status: "active" | "handoff_requested" | "completed"; created_at: string; updated_at: string; state_json: string } | undefined;
  if (!row) {
    return null;
  }
  return sessionSchema.parse({
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: JSON.parse(row.state_json)
  });
}

export function updateSessionState(db: Database.Database, id: string, state: SessionState, status?: "active" | "handoff_requested" | "completed") {
  const ts = now();
  if (status) {
    db.prepare("UPDATE sessions SET state_json = ?, status = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), status, ts, id);
  } else {
    db.prepare("UPDATE sessions SET state_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), ts, id);
  }
  return getSession(db, id);
}

export function addSessionMessage(db: Database.Database, sessionId: string, role: "user" | "assistant" | "tool", content: string): number {
  const result = db.prepare("INSERT INTO session_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").run(
    sessionId,
    role,
    content,
    now()
  );
  return Number(result.lastInsertRowid);
}

export function updateSessionMessageContent(db: Database.Database, id: number, content: string): void {
  db.prepare("UPDATE session_messages SET content = ? WHERE id = ?").run(content, id);
}
