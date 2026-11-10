import type { Fields } from "./spam";
import { eachSubmission, listQuery, type Scope } from "./forms.ts";

type Row = { id: string; createdAt: string; data: Fields; files: { name: string }[] };

// A cell starting with = + - @ would run as a formula in Excel/Sheets; a leading ' keeps it text.
const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const header = (names: string[]) => "\uFEFF" + ["id", "submitted_at", ...names, "files"].map(cell).join(",") + "\r\n";
const line = (r: Row, names: string[]) =>
  [r.id, r.createdAt, ...names.map((n) => [r.data[n] ?? ""].flat().join(", ")), r.files.map((f) => f.name).join(", ")].map(cell).join(",") + "\r\n";

/** Submissions → CSV: id, date, then every field name in first-seen order, then file names. */
export const toCsv = (rows: Row[]) => {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.data)))];
  return header(names) + rows.map((r) => line(r, names)).join("");
};

/** The CSV download for an admin inbox view: same filters, search and order as the list, every page. `names` adds a `form` column. */
export const viewCsv = (scope: Scope, params: URLSearchParams, label: string, names?: Map<string, string>) => {
  const { view, q, days, order } = listQuery(params);
  const rows = () => eachSubmission(scope, view, q, { days, order });
  // Streamed, so memory stays flat however big the inbox is: one pass for the column names, one for the rows.
  // shortcut: a field first used by a submission arriving between the two passes gets no column; snapshot the read if that matters.
  async function* body() {
    const fields = new Set<string>(names ? ["form"] : []);
    let n = 0;
    for (const s of rows()) {
      for (const k of Object.keys(s.data)) fields.add(k);
      if (++n % 1000 === 0) await new Promise(setImmediate); // let other requests through
    }
    const cols = [...fields];
    const text = new TextEncoder();
    let out = header(cols);
    for (const s of rows()) {
      out += line({ id: s.id, createdAt: new Date(s.createdAt * 1000).toISOString(), data: names ? { form: names.get(s.formKey) ?? "", ...s.data } : s.data, files: s.files }, cols);
      if (out.length > 65536) {
        yield text.encode(out);
        out = "";
      }
    }
    yield text.encode(out);
  }
  const name = `${label.replace(/[^\w-]+/g, "-").toLowerCase() || "submissions"}-${view}.csv`;
  const it = body();
  const stream = new ReadableStream<Uint8Array>({
    async pull(c) {
      const { value, done } = await it.next();
      if (done) c.close();
      else c.enqueue(value);
    },
    cancel: () => void it.return(),
  });
  return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
};
