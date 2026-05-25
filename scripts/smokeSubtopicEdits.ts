import Database from "better-sqlite3";
import { runAgentTurn } from "../src/agent/agentLoop.js";
import { initializeDatabase, seedMenu } from "../src/menu/menuService.js";
import { createSession, getSession, updateSessionState } from "../src/sessions/sessionService.js";

type Step = { user: string; expectReplyIncludes: string[] };
type Scenario = { name: string; steps: Step[] };

function runScenario(db: Database.Database, scenario: Scenario): void {
  const session = createSession(db);
  console.log(`\n=== ${scenario.name} ===`);

  for (const step of scenario.steps) {
    const current = getSession(db, session.id);
    if (!current) {
      throw new Error("Session missing");
    }
    const result = runAgentTurn(db, session.id, step.user, current.state);
    updateSessionState(db, session.id, result.state, result.handoffRequested ? "handoff_requested" : current.status);

    console.log(`You: ${step.user}`);
    console.log(`Agent: ${result.reply}`);

    for (const expected of step.expectReplyIncludes) {
      if (!result.reply.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(`Scenario '${scenario.name}' failed: expected reply to include '${expected}'`);
      }
    }
  }

  console.log(`PASS: ${scenario.name}`);
}

function main(): void {
  const db = new Database(":memory:");
  initializeDatabase(db);
  seedMenu(db);

  const scenarios: Scenario[] = [
    {
      name: "Targeted preset crust edit",
      steps: [
        { user: "pickup", expectReplyIncludes: ["what name"] },
        { user: "Jordan", expectReplyIncludes: ["phone number"] },
        { user: "555-000-1111", expectReplyIncludes: ["what would you like to order"] },
        { user: "I want 5 pizzas: 3 cheese, 2 supreme", expectReplyIncludes: ["size and crust"] },
        { user: "large thin", expectReplyIncludes: ["any drinks, wings, or special instructions"] },
        { user: "make the supreme pan crust", expectReplyIncludes: ["updated"] }
      ]
    },
    {
      name: "Ambiguous edit asks clarification",
      steps: [
        { user: "pickup", expectReplyIncludes: ["what name"] },
        { user: "Jordan", expectReplyIncludes: ["phone number"] },
        { user: "555-000-1111", expectReplyIncludes: ["what would you like to order"] },
        { user: "I want 5 pizzas: 3 cheese, 2 supreme", expectReplyIncludes: ["size and crust"] },
        { user: "large thin", expectReplyIncludes: ["any drinks, wings, or special instructions"] },
        { user: "make that pan crust", expectReplyIncludes: ["which pizzas should i apply it to"] }
      ]
    },
    {
      name: "Missing preset target asks clarification",
      steps: [
        { user: "pickup", expectReplyIncludes: ["what name"] },
        { user: "Jordan", expectReplyIncludes: ["phone number"] },
        { user: "555-000-1111", expectReplyIncludes: ["what would you like to order"] },
        { user: "I want 5 pizzas: 3 cheese, 2 supreme", expectReplyIncludes: ["size and crust"] },
        { user: "large thin", expectReplyIncludes: ["any drinks, wings, or special instructions"] },
        { user: "make the pepperoni pan crust", expectReplyIncludes: ["do not have any pepperoni pizzas", "or all pizzas"] }
      ]
    },
    {
      name: "Overlapping topping name resolves correctly",
      steps: [
        { user: "pickup", expectReplyIncludes: ["what name"] },
        { user: "Jordan", expectReplyIncludes: ["phone number"] },
        { user: "555-000-1111", expectReplyIncludes: ["what would you like to order"] },
        { user: "I want 1 pizza: 1 cheese", expectReplyIncludes: ["size and crust"] },
        { user: "large thin", expectReplyIncludes: ["any drinks, wings, or special instructions"] },
        { user: "remove extra cheese from all pizzas", expectReplyIncludes: ["updated"] }
      ]
    },
    {
      name: "Hand toss alias updates crust",
      steps: [
        { user: "pickup", expectReplyIncludes: ["what name"] },
        { user: "Jordan", expectReplyIncludes: ["phone number"] },
        { user: "555-000-1111", expectReplyIncludes: ["what would you like to order"] },
        { user: "I want 5 pizzas: 3 cheese, 2 supreme", expectReplyIncludes: ["size and crust"] },
        { user: "large thin", expectReplyIncludes: ["any drinks, wings, or special instructions"] },
        { user: "make the supreme hand toss", expectReplyIncludes: ["updated"] }
      ]
    },
    {
      name: "Pepp alias removes pepperoni",
      steps: [
        { user: "pickup", expectReplyIncludes: ["what name"] },
        { user: "Jordan", expectReplyIncludes: ["phone number"] },
        { user: "555-000-1111", expectReplyIncludes: ["what would you like to order"] },
        { user: "I want 1 pizzas: 1 pepperoni", expectReplyIncludes: ["size and crust"] },
        { user: "large thin", expectReplyIncludes: ["any drinks, wings, or special instructions"] },
        { user: "remove pepp from all pizzas", expectReplyIncludes: ["updated"] }
      ]
    },
    {
      name: "Grouped pepp shorthand parses pepperoni preset",
      steps: [
        { user: "pickup", expectReplyIncludes: ["what name"] },
        { user: "Jordan", expectReplyIncludes: ["phone number"] },
        { user: "555-000-1111", expectReplyIncludes: ["what would you like to order"] },
        { user: "I want 2 pepp pizzas", expectReplyIncludes: ["added 2 pepperoni pizzas", "size and crust"] }
      ]
    }
  ];

  for (const scenario of scenarios) {
    runScenario(db, scenario);
  }

  db.close();
  console.log("\nSmoke test complete.");
}

main();
