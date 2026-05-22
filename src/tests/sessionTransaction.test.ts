import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerRoutes } from "../api/routes.js";
import { createTestDb } from "./testDb.js";
import { createSession } from "../sessions/sessionService.js";

describe("session turn transaction", () => {
  it("rolls back user message when turn processing fails", async () => {
    const db = createTestDb();
    const session = createSession(db);

    const badState = {
      fulfillmentType: "pickup",
      customerName: "Alex",
      phoneNumber: "555-111-2222",
      items: [{ invalid: true }],
      handoffRequested: false
    };

    db.prepare("UPDATE sessions SET state_json = ? WHERE id = ?").run(JSON.stringify(badState), session.id);

    const app = Fastify();
    app.decorate("db", db);
    await registerRoutes(app);

    const before = db.prepare("SELECT COUNT(*) AS count FROM session_messages WHERE session_id = ?").get(session.id) as { count: number };

    const response = await app.inject({
      method: "POST",
      url: `/sessions/${session.id}/message`,
      payload: { message: "extra cheese please" }
    });

    const after = db.prepare("SELECT COUNT(*) AS count FROM session_messages WHERE session_id = ?").get(session.id) as { count: number };

    expect(response.statusCode).toBe(500);
    expect(after.count).toBe(before.count);

    await app.close();
    db.close();
  });
});
