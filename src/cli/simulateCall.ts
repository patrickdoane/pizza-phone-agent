import Database from "better-sqlite3";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { GREETING, runAgentTurn } from "../agent/agentLoop.js";
import { config } from "../config.js";
import { initializeDatabase, seedMenu } from "../menu/menuService.js";
import { addSessionMessage, createSession, getSession, updateSessionState } from "../sessions/sessionService.js";

async function simulate() {
  const db = new Database(config.dbPath);
  initializeDatabase(db);
  seedMenu(db);

  const session = createSession(db);
  const rl = readline.createInterface({ input, output });

  console.log(`Agent: ${GREETING}`);
  addSessionMessage(db, session.id, "assistant", GREETING);

  try {
    while (true) {
      const user = await rl.question("You: ");
      if (user.trim().toLowerCase() === "exit") {
        console.log("Agent: Thanks for calling. Goodbye.");
        break;
      }
      addSessionMessage(db, session.id, "user", user);
      const current = getSession(db, session.id);
      if (!current) {
        throw new Error("Session missing");
      }
      const result = runAgentTurn(db, session.id, user, current.state);
      console.log(`Agent: ${result.reply}`);
      addSessionMessage(db, session.id, "assistant", result.reply);
      updateSessionState(db, session.id, result.state, result.handoffRequested ? "handoff_requested" : current.status);
    }
  } finally {
    rl.close();
    db.close();
  }
}

simulate().catch((error) => {
  console.error(error);
  process.exit(1);
});
