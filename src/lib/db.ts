import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const path = process.env.DB_PATH || "data/gitupcms-forms.db";
mkdirSync(dirname(path), { recursive: true });

/** One SQLite file holds everything: forms, submissions, delivery logs and the admin accounts (uploaded files live next to it). */
export const db = new Database(path);
db.pragma("journal_mode = WAL");
