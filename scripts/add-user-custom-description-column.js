#!/usr/bin/env node

/**
 * Migration: Add user_custom_description column to calls table
 * Usage: node add-user-custom-description-column.js
 * 
 * Requires DATABASE_URL environment variable to be set
 */

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.DATABASE_URL.includes("postgres")
      ? { rejectUnauthorized: false }
      : undefined,
});

async function main() {
  console.log("Starting migration: add user_custom_description column...");
  
  try {
    // Check if column already exists
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' AND column_name = 'user_custom_description'
      )
    `);

    if (checkResult.rows[0].exists) {
      console.log("✓ Column user_custom_description already exists. No migration needed.");
      process.exit(0);
    }

    // Add the column
    console.log("Adding user_custom_description column to calls table...");
    await pool.query(`
      ALTER TABLE calls 
      ADD COLUMN user_custom_description VARCHAR(500)
    `);

    console.log("✓ Migration complete: user_custom_description column added successfully!");
    process.exit(0);
  } catch (err) {
    console.error("✗ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
