import { FastifyInstance } from "fastify";
import { GREETING, runAgentTurn } from "../agent/agentLoop.js";
import { getMenu } from "../menu/menuService.js";
import { updateOrderStatus } from "../orders/orderService.js";
import { sessionMessageSchema } from "../sessions/sessionSchema.js";
import { addSessionMessage, createSession, getSession, updateSessionState } from "../sessions/sessionService.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  app.get("/menu", async (_req, reply) => {
    try {
      return getMenu(app.db);
    } catch (error) {
      reply.code(500);
      return { error: (error as Error).message };
    }
  });

  app.post("/sessions", async () => {
    const session = createSession(app.db);
    addSessionMessage(app.db, session.id, "assistant", GREETING);
    return { sessionId: session.id, greeting: GREETING };
  });

  app.post("/sessions/:id/message", async (req, reply) => {
    const params = req.params as { id: string };
    const parsed = sessionMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.flatten() };
    }
    const session = getSession(app.db, params.id);
    if (!session) {
      reply.code(404);
      return { error: "Session not found" };
    }

    const processTurn = app.db.transaction(() => {
      addSessionMessage(app.db, session.id, "user", parsed.data.message);
      const result = runAgentTurn(app.db, session.id, parsed.data.message, session.state);
      addSessionMessage(app.db, session.id, "assistant", result.reply);
      updateSessionState(app.db, session.id, result.state, result.handoffRequested ? "handoff_requested" : session.status);
      return result;
    });

    const result = processTurn();
    return { reply: result.reply, pendingOrderId: result.pendingOrderId ?? null, handoffRequested: !!result.handoffRequested };
  });

  app.post("/orders/:id/approve", async (req, reply) => {
    const params = req.params as { id: string };
    try {
      return updateOrderStatus(app.db, params.id, "approved");
    } catch (error) {
      reply.code(404);
      return { error: (error as Error).message };
    }
  });

  app.post("/orders/:id/reject", async (req, reply) => {
    const params = req.params as { id: string };
    try {
      return updateOrderStatus(app.db, params.id, "rejected");
    } catch (error) {
      reply.code(404);
      return { error: (error as Error).message };
    }
  });
}
