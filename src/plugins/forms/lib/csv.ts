import type { Fields } from "./spam";

type Row = { id: string; createdAt: string; data: Fields; files: { name: string }[] };

// A cell starting with = + - @ would run as a formula in Excel/Sheets; a leading ' keeps it text.
const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Submissions → CSV: id, date, then every field name in first-seen order, then file names. */
export const toCsv = (rows: Row[]) => {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.data)))];
  const lines = [["id", "submitted_at", ...names, "files"]];
  for (const r of rows) {
    const value = (n: string) => [r.data[n] ?? ""].flat().join(", ");
    lines.push([r.id, r.createdAt, ...names.map(value), r.files.map((f) => f.name).join(", ")]);
  }
  return "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
};
