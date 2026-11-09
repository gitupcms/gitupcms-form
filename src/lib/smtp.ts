/**
 * Sends one HTML email over SMTP: implicit TLS on port 465, STARTTLS when the server offers it, AUTH PLAIN or LOGIN.
 */
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

export type SmtpConfig = { host: string; port: number; user: string; pass: string; secure?: boolean };
export type Mail = { from: string; fromName?: string; to: string; replyTo?: string; subject: string; html: string };

const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
const address = (s: string) => {
  if (/[\r\n<>]/.test(s)) throw new Error(`Invalid email address: ${s}`);
  return s;
};

export const buildMessage = (mail: Mail) =>
  [
    `From: ${mail.fromName ? `${word(mail.fromName.replace(/["\r\n]/g, ""))} ` : ""}<${address(mail.from)}>`,
    `To: <${address(mail.to)}>`,
    ...(mail.replyTo ? [`Reply-To: <${address(mail.replyTo)}>`] : []),
    `Subject: ${word(mail.subject.replace(/[\r\n]+/g, " "))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${mail.from.split("@")[1] ?? "localhost"}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    // base64 lines never start with ".", so no dot-stuffing is needed.
    ...(Buffer.from(mail.html).toString("base64").match(/.{1,76}/g) ?? []),
  ].join("\r\n");

export const sendSmtp = (cfg: SmtpConfig, mail: Mail, timeoutMs = 15_000) =>
  new Promise<void>((resolve, reject) => {
    const secure = cfg.secure ?? cfg.port === 465;
    let socket: net.Socket = secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.port });
    let buffer = "";
    let waiting: ((reply: { code: number; text: string }) => void) | null = null;
    const fail = (e: Error) => (socket.destroy(), reject(e));
    const timer = setTimeout(() => fail(new Error("SMTP timed out")), timeoutMs);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // A reply ends with a "250 text" line; "250-text" lines continue it.
      const done = buffer.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/);
      if (!done || !waiting) return;
      const reply = { code: Number(done[1]), text: buffer };
      buffer = "";
      const w = waiting;
      waiting = null;
      w(reply);
    };
    const listen = (s: net.Socket) => (s.on("data", onData), s.on("error", fail));
    listen(socket);
    const read = () => new Promise<{ code: number; text: string }>((r) => (waiting = r));
    const send = async (line: string | null, expect: number) => {
      const reply = read();
      if (line !== null) socket.write(`${line}\r\n`);
      const r = await reply;
      if (Math.floor(r.code / 100) !== Math.floor(expect / 100)) throw new Error(`SMTP ${line?.split(" ")[0] ?? "greeting"} failed: ${r.text.trim()}`);
      return r.text;
    };
    (async () => {
      await send(null, 220);
      let ehlo = await send("EHLO wuppycms", 250);
      if (!secure && /STARTTLS/i.test(ehlo)) {
        await send("STARTTLS", 220);
        socket.removeAllListeners("data");
        socket = tls.connect({ socket, servername: cfg.host });
        listen(socket);
        await new Promise((r) => socket.once("secureConnect", r));
        ehlo = await send("EHLO wuppycms", 250);
      }
      if (cfg.user) {
        if (/AUTH[^\r\n]*PLAIN/i.test(ehlo)) await send(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString("base64")}`, 235);
        else {
          await send("AUTH LOGIN", 334);
          await send(Buffer.from(cfg.user).toString("base64"), 334);
          await send(Buffer.from(cfg.pass).toString("base64"), 235);
        }
      }
      await send(`MAIL FROM:<${address(mail.from)}>`, 250);
      await send(`RCPT TO:<${address(mail.to)}>`, 250);
      await send("DATA", 354);
      await send(`${buildMessage(mail)}\r\n.`, 250);
      socket.end("QUIT\r\n");
    })().then(
      () => (clearTimeout(timer), resolve()),
      (e) => (clearTimeout(timer), fail(e)),
    );
  });
