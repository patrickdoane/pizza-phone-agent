import Fastify from "fastify";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { registerRoutes } from "./api/routes.js";
import { initializeDatabase, seedMenu } from "./menu/menuService.js";

async function main() {
  const db = new Database(config.dbPath);
  initializeDatabase(db);
  seedMenu(db);

  if (process.argv.includes("--seed-only")) {
    db.close();
    return;
  }

  const app = Fastify({ logger: true });
  app.decorate("db", db);
  await registerRoutes(app);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
