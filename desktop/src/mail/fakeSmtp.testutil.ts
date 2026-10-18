/** 테스트용 가짜 보내기 서버(SMTP). 받은 메일을 기록한다. 실제 메일 서버에는 접속하지 않는다. (빌드에는 포함되지 않는다) */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { type ParsedMail, simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";

export interface ReceivedMail {
  envelope: { from: string; to: string[] };
  raw: Buffer;
  parsed: ParsedMail;
}

export interface FakeSmtp {
  port: number;
  user: string;
  pass: string;
  messages: ReceivedMail[];
  /** TLS 로 접속할 때 서버 인증서를 믿게 하는 인증서(PEM) */
  ca: Buffer;
  close(): Promise<void>;
}

export interface FakeSmtpOptions {
  /** 465 처럼 암호화로 바로 접속 (hoodiecrow-imap 에 든 자체 서명 인증서 사용: localhost/127.0.0.1) */
  secure?: boolean;
  /** 이 주소를 받는 사람으로 지정하면 550 으로 거절한다 */
  rejectRcpt?: string;
  /** 메일 크기 한도(바이트). 넘으면 552 */
  maxSize?: number;
}

const CERT_DIR = path.join(__dirname, "..", "..", "node_modules", "hoodiecrow-imap", "cert");

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export async function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
  const port = await freePort();
  const messages: ReceivedMail[] = [];
  const key = fs.readFileSync(path.join(CERT_DIR, "server.key"));
  const cert = fs.readFileSync(path.join(CERT_DIR, "server.crt"));
  const user = "testuser";
  const pass = "testpass";

  const server = new SMTPServer({
    secure: options.secure === true,
    ...(options.secure ? { key, cert } : {}),
    allowInsecureAuth: true,
    authOptional: false,
    disabledCommands: options.secure ? [] : ["STARTTLS"],
    size: options.maxSize,
    onAuth(auth, _session, cb) {
      if (auth.username === user && auth.password === pass) cb(null, { user });
      else cb(new Error("Invalid login"));
    },
    onRcptTo(address, _session, cb) {
      if (options.rejectRcpt && address.address.toLowerCase() === options.rejectRcpt.toLowerCase()) {
        const err = new Error("Mailbox unavailable") as Error & { responseCode: number };
        err.responseCode = 550;
        return cb(err);
      }
      cb();
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        const raw = Buffer.concat(chunks);
        if ((stream as unknown as { sizeExceeded?: boolean }).sizeExceeded) {
          const err = new Error("Message size exceeds fixed maximum message size") as Error & { responseCode: number };
          err.responseCode = 552;
          return cb(err);
        }
        simpleParser(raw).then((parsed) => {
          messages.push({
            envelope: { from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((r) => r.address) },
            raw,
            parsed,
          });
          cb();
        }, cb);
      });
    },
  });
  // 클라이언트가 인증서를 거부해 연결을 끊으면 서버 쪽에 오류 이벤트가 오는데, 시험에서는 정상적인 일이므로 무시한다
  server.on("error", () => {});
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { port, user, pass, messages, ca: cert, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
