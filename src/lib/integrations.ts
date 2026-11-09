// Encrypts stored secrets (a site's SMTP password and OAuth apps) with a key from BETTER_AUTH_SECRET.
// Same scheme as WuppyCMS, so data moved between the two stays readable.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const cipherKey = () => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to store credentials.");
  return createHash("sha256").update(`wuppycms:integrations:${secret}`).digest();
};

export const encrypt = (text: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
};

export const decrypt = (value: string) => {
  const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", cipherKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};
