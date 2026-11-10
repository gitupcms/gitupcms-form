import type { Fields } from "./spam";
import { listQuery, submissions, type Scope } from "./forms.ts";

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

/** The CSV download for an admin inbox view: same filters, search and order as the list, every page. `names` adds a `form` column. */
export const viewCsv = (scope: Scope, params: URLSearchParams, label: string, names?: Map<string, string>) => {
  const { view, q, days, order } = listQuery(params);
  const { items } = submissions(scope, view, q, 1, { perPage: Number.MAX_SAFE_INTEGER, days, order });
  const rows = items.map((s) => ({ id: s.id, createdAt: new Date(s.createdAt * 1000).toISOString(), data: names ? { form: names.get(s.formKey) ?? "", ...s.data } : s.data, files: s.files }));
  const name = `${label.replace(/[^\w-]+/g, "-").toLowerCase() || "submissions"}-${view}.csv`;
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
};
