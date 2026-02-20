"use strict";

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

function scenarioTagToHumanFriendly(tag) {
  const scenarios = {
    doctor_default: "calling a doctor's office to schedule an appointment",
    pharmacy_refill: "refilling a prescription at a pharmacy",
    school_office: "calling a school office",
  };
  return scenarios[tag] || "a practice call";
}

async function backfillScenarioLabels() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const r = await pool.query(
      "select call_sid, scenario_tag from calls where scenario_tag is not null and scenario_label is null"
    );

    if (!r.rows || r.rows.length === 0) {
      console.log("No rows to backfill.");
      return;
    }

    let updated = 0;
    for (const row of r.rows) {
      const label = scenarioTagToHumanFriendly(row.scenario_tag);
      await pool.query(
        "update calls set scenario_label = $2 where call_sid = $1 and scenario_label is null",
        [row.call_sid, label]
      );
      updated += 1;
    }

    console.log("Backfill complete.", { updated });
  } catch (e) {
    console.error("Backfill failed:", e && e.message ? e.message : e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

backfillScenarioLabels();
