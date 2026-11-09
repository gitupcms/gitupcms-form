/**
 * Admins beyond the first one join by invite: an admin invites an email, the link lets that email sign up
 * (password or GitHub) within a week. Every admin can do everything, including removing other admins.
 */
import { randomBytes } from "node:crypto";
import { db } from "./db.ts";

db.exec(`CREATE TABLE IF NOT EXISTS admin_invite (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  expires_at INTEGER NOT NULL
)`);

const WEEK = 7 * 24 * 3600;
const now = () => Math.floor(Date.now() / 1000);
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const invite = (email: string) => {
  const token = randomBytes(24).toString("base64url");
  db.prepare("DELETE FROM admin_invite WHERE email = ?").run(email);
  db.prepare("INSERT INTO admin_invite (token, email, expires_at) VALUES (?, ?, ?)").run(token, email, now() + WEEK);
  return token;
};
/** The email an unexpired invite is for, else null. */
export const inviteEmail = (token: string) => (db.prepare("SELECT email FROM admin_invite WHERE token = ? AND expires_at > ?").get(token, now()) as { email: string } | undefined)?.email ?? null;
export const invited = (email: string) => !!db.prepare("SELECT 1 FROM admin_invite WHERE email = ? AND expires_at > ?").get(email, now());
export const useInvite = (email: string) => void db.prepare("DELETE FROM admin_invite WHERE email = ?").run(email);
export const revoke = (token: string) => void db.prepare("DELETE FROM admin_invite WHERE token = ?").run(token);
export const invites = () => db.prepare("SELECT token, email, expires_at AS expiresAt FROM admin_invite WHERE expires_at > ? ORDER BY email").all(now()) as { token: string; email: string; expiresAt: number }[];

export const admins = () => db.prepare('SELECT id, name, email, "createdAt" FROM "user" ORDER BY "createdAt"').all() as { id: string; name: string; email: string; createdAt: string }[];
/** Removes an admin and signs them out everywhere. */
export const removeAdmin = (id: string) =>
  db.transaction(() => {
    db.prepare('DELETE FROM "session" WHERE "userId" = ?').run(id);
    db.prepare('DELETE FROM "account" WHERE "userId" = ?').run(id);
    return db.prepare('DELETE FROM "user" WHERE id = ?').run(id).changes > 0;
  })();
