/**
 * Reads a form post (urlencoded, multipart with files, or JSON) into fields, files and the reserved `_` options.
 * Everything here comes from the open internet, so every size is capped before it is stored.
 */
import { HttpError } from "../../../lib/http.ts";
import type { Fields } from "./spam";

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];
/** Biggest request with files (MAX_UPLOAD_MB, default 10); posts without files may be 100 KB. */
export const maxUpload = () => (Number(env("MAX_UPLOAD_MB")) || 10) * 1024 * 1024;
const MAX_TEXT_BODY = 100 * 1024;
const MAX_FIELDS = 100;
const MAX_NAME = 100;
const MAX_VALUE = 20_000;
const MAX_FILES = 10;

/** `_redirect`, `_subject`, `_replyto` and the `_gotcha` honeypot; other `_` names are dropped. */
export type Options = { redirect: string; subject: string; replyTo: string; honeypot: string };
export type Upload = { field: string; file: File };
export type Parsed = { data: Fields; files: Upload[]; options: Options };

const add = (data: Fields, name: string, value: string) => {
  const prev = data[name];
  data[name] = prev === undefined ? value : [...(Array.isArray(prev) ? prev : [prev]), value];
};

export const parseSubmission = async (request: Request): Promise<Parsed> => {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const length = Number(request.headers.get("content-length"));
  const limit = type === "multipart/form-data" ? maxUpload() : MAX_TEXT_BODY;
  // Browsers always send Content-Length for forms; without it the body size is unknown until read.
  if (!length) throw new HttpError("Content-Length is required.", 411);
  if (length > limit) throw new HttpError(`The submission is too large (limit ${Math.round(limit / 1024 / 1024) || 0.1} MB).`, 413);

  const entries: [string, string | File][] = [];
  if (type === "application/json") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Send a JSON object.", 400);
    for (const [k, v] of Object.entries(body))
      for (const item of Array.isArray(v) ? v : [v]) entries.push([k, item === null || item === undefined ? "" : typeof item === "object" ? JSON.stringify(item) : String(item)]);
  } else if (type === "application/x-www-form-urlencoded" || type === "multipart/form-data") {
    const form = await request.formData().catch(() => null);
    if (!form) throw new HttpError("The form data could not be read.", 400);
    entries.push(...form.entries());
  } else throw new HttpError("Send the form as a normal HTML form post or as JSON.", 415);

  const data: Fields = {};
  const files: Upload[] = [];
  const options: Options = { redirect: "", subject: "", replyTo: "", honeypot: "" };
  let count = 0;
  for (const [rawName, value] of entries) {
    const name = rawName.trim().slice(0, MAX_NAME);
    if (!name) continue;
    if (++count > MAX_FIELDS) throw new HttpError(`Too many fields (limit ${MAX_FIELDS}).`, 413);
    if (typeof value !== "string") {
      // An empty file input still posts a nameless, empty file.
      if (!value.size && !value.name) continue;
      if (files.length >= MAX_FILES) throw new HttpError(`Too many files (limit ${MAX_FILES}).`, 413);
      files.push({ field: name, file: value });
      continue;
    }
    if (value.length > MAX_VALUE) throw new HttpError(`The field "${name}" is too long (limit ${MAX_VALUE} characters).`, 413);
    if (name === "_redirect" || name === "_next") options.redirect = value.trim();
    else if (name === "_subject") options.subject = value.trim().slice(0, 200);
    else if (name === "_replyto") options.replyTo = value.trim();
    else if (name === "_gotcha" || name === "_honeypot") options.honeypot = value;
    else if (!name.startsWith("_")) add(data, name, value);
  }
  if (!options.replyTo && typeof data.email === "string") options.replyTo = data.email.trim();
  return { data, files, options };
};
