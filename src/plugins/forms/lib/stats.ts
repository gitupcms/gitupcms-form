/** Analytics and usage, read from the per-day `stat` counts (forms.ts). Days are UTC. */
import { db } from "../../../lib/db.ts";
import "./forms.ts";

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const monthStart = (offset = 0) => {
  const d = new Date();
  return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
};

const sum = (where: string, ...args: (string | number)[]) => (db.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM stat WHERE ${where}`).get(...args) as { n: number }).n;
const top = (column: "source" | "country", formKey: string, from: string) =>
  db.prepare(`SELECT ${column} AS name, SUM(n) AS n FROM stat WHERE form_key = ? AND status = 'inbox' AND day >= ? GROUP BY ${column} ORDER BY n DESC LIMIT 10`).all(formKey, from) as { name: string; n: number }[];

export const RANGES = [7, 30, 90];

/** One form's totals, a day-by-day series over the last `days` days (spam apart), and where submissions came from. */
export const analytics = (formKey: string, days = 30, at = Date.now()) => {
  const from = isoDay(at - (days - 1) * DAY);
  const rows = db.prepare("SELECT day, status, SUM(n) AS n FROM stat WHERE form_key = ? AND day >= ? GROUP BY day, status").all(formKey, from) as { day: string; status: string; n: number }[];
  const series = Array.from({ length: days }, (_, i) => {
    const day = isoDay(at - (days - 1 - i) * DAY);
    const n = (status: string) => rows.find((r) => r.day === day && r.status === status)?.n ?? 0;
    return { day, inbox: n("inbox"), spam: n("spam") };
  });
  const inbox = (where: string, ...args: string[]) => sum(`form_key = ? AND status = 'inbox' AND ${where}`, formKey, ...args);
  return {
    total: inbox("1"),
    month: inbox("day >= ?", monthStart()),
    lastMonth: inbox("day >= ? AND day < ?", monthStart(-1), monthStart()),
    week: inbox("day >= ?", isoDay(at - 6 * DAY)),
    spam: sum("form_key = ? AND status = 'spam'", formKey),
    series,
    sources: top("source", formKey, from),
    countries: top("country", formKey, from),
  };
};

/** Submissions (not spam) across every form this calendar month: what MONTHLY_SUBMISSION_LIMIT counts. */
export const monthUsage = () => sum("status = 'inbox' AND day >= ?", monthStart());
/** This month's submissions per form, most first. */
export const monthByForm = () =>
  db.prepare("SELECT f.key, f.name, COALESCE(SUM(s.n), 0) AS n FROM form f LEFT JOIN stat s ON s.form_key = f.key AND s.status = 'inbox' AND s.day >= ? GROUP BY f.key ORDER BY n DESC, f.name").all(monthStart()) as { key: string; name: string; n: number }[];
