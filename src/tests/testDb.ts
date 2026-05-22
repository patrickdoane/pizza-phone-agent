import Database from "better-sqlite3";
import { initializeDatabase, seedMenu } from "../menu/menuService.js";

export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  initializeDatabase(db);
  seedMenu(db);
  return db;
}
