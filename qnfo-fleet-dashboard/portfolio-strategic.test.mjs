// PORTFOLIO-STRATEGIC-2 offline suite: the public latest-review feed carries its roadmap and goal counts.
// Run: node qnfo-fleet-dashboard/portfolio-strategic.test.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE program_review_notes (
  day TEXT NOT NULL,
  program_code TEXT NOT NULL,
  manager_persona TEXT,
  verdict TEXT NOT NULL,
  risk_score REAL,
  top_actions TEXT,
  narrative TEXT,
  roadmap_now INTEGER,
  roadmap_next INTEGER,
  roadmap_later INTEGER,
  goals_adopted INTEGER,
  goals_completed INTEGER
);
CREATE TABLE portfolio_runs (
  id INTEGER PRIMARY KEY,
  run_date TEXT,
  kind TEXT,
  summary TEXT
);`);
db.prepare(`INSERT INTO program_review_notes
  (day, program_code, manager_persona, verdict, risk_score, top_actions, narrative,
   roadmap_now, roadmap_next, roadmap_later, goals_adopted, goals_completed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run("2026-10-25", "QNFO.OPS", "program-manager:QNFO.OPS", "AMBER", 42.5,
    "review roadmap", null, 3, 2, 7, 5, 1);
db.prepare("INSERT INTO portfolio_runs (run_date, kind, summary) VALUES (?, ?, ?)")
  .run("2026-10-25", "weekly-strategic", "constraint QNFO.OPS");

const env = {
  AUDIT: {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) {
          params = values;
          return statement;
        },
        async all() {
          return { results: db.prepare(sql).all(...params) };
        }
      };
      return statement;
    }
  }
};
const response = await worker.fetch(
  new Request("https://fleet.qnfo.org/api/portfolio/latest"),
  env,
  { waitUntil() {} }
);
const body = await response.json();
const note = body.notes && body.notes[0];
const expected = {
  roadmap_now: 3,
  roadmap_next: 2,
  roadmap_later: 7,
  goals_adopted: 5,
  goals_completed: 1
};
const missing = Object.entries(expected).filter(([key, value]) => !note || note[key] !== value);
if (response.status !== 200 || !body.ok || missing.length) {
  console.error("FAIL public latest review includes stored roadmap and goal counts", {
    status: response.status,
    body,
    missing: missing.map(([key]) => key)
  });
  process.exit(1);
}
console.log("portfolio-strategic: 1 passed, 0 failed");
