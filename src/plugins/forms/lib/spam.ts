/**
 * Scores a submission from signals; at THRESHOLD or above it goes to Spam (kept, never emailed or sent on).
 * Pure: the caller looks up the counts (recent sends from the IP, duplicates) and passes them in.
 */
export const THRESHOLD = 50;

export type Fields = Record<string, string | string[]>;
export type Signal = { reason: string; points: number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const values = (data: Fields) => Object.values(data).flat();

/** Blocklist lines: a word or phrase, an email address, or an IP; matched case-insensitively. */
export const blocklistLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);

export const spamCheck = (input: { data: Fields; honeypot: string; email: string; ip: string; recentFromIp: number; duplicate: boolean; blocklist: string; threshold?: number }) => {
  const signals: Signal[] = [];
  const add = (points: number, reason: string) => signals.push({ points, reason });
  const all = values(input.data);
  const text = [...all, input.email].join("\n").toLowerCase();

  if (input.honeypot) add(100, "The hidden honeypot field (_gotcha) was filled in");
  if (!all.some((v) => v.trim())) add(60, "Every field is empty");
  const hit = blocklistLines(input.blocklist).find((line) => (line === input.ip.toLowerCase() ? true : text.includes(line)));
  if (hit) add(100, `Matches the blocklist: ${hit}`);
  if (input.recentFromIp >= 5) add(40, `${input.recentFromIp} submissions from this IP in the last 10 minutes`);
  if (input.duplicate) add(40, "The same content was sent in the last 24 hours");
  const links = text.match(/https?:\/\//g)?.length ?? 0;
  if (links >= 3) add(40, `${links} links`);
  else if (links > 0) add(10, links === 1 ? "1 link" : `${links} links`);
  if (/<a\s+href|\[url[=\]]/.test(text)) add(30, "HTML or BBCode links");
  if (input.email && !EMAIL.test(input.email)) add(30, "The email field is not an email address");

  const score = signals.reduce((s, x) => s + x.points, 0);
  return { score, signals, spam: score >= (input.threshold ?? THRESHOLD) };
};
