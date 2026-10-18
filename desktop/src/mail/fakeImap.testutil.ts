/** 테스트용 가짜 메일 서버와 메일 만들기 도구. 실제 메일 서버에는 접속하지 않는다. (빌드에는 포함되지 않는다) */
import net from "node:net";

// @ts-expect-error hoodiecrow-imap 은 타입 정의가 없다
import hoodiecrow from "hoodiecrow-imap";

export interface FakeMessage {
  raw: string;
  flags?: string[];
  internaldate?: Date;
}

export interface FakeImap {
  port: number;
  user: string;
  pass: string;
  close(): Promise<void>;
}

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

export async function startFakeImap(
  messages: FakeMessage[] = [],
  extraFolders: Record<string, string> = { Sent: "\\Sent" },
  options: { secure?: boolean } = {},
): Promise<FakeImap> {
  const port = await freePort();
  const folders: Record<string, unknown> = {};
  for (const [name, use] of Object.entries(extraFolders)) folders[name] = { "special-use": use };
  const server = hoodiecrow({
    storage: { INBOX: { messages }, "": { separator: "/", folders } },
    plugins: ["UIDPLUS", "SPECIAL-USE", "MOVE"],
    secureConnection: options.secure === true, // 993 처럼 암호화로 바로 접속 (번들된 자체 서명 인증서)
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    port,
    user: "testuser",
    pass: "testpass",
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const encodeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export interface RawOptions {
  subject?: string;
  fromName?: string;
  from?: string;
  to?: string;
  cc?: string;
  date?: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; contentType: string; content: Buffer; cid?: string; inline?: boolean }[];
}

/** RFC 822 형식의 메일 원문을 만든다 (한글 제목·본문은 base64) */
export function buildRaw(o: RawOptions = {}): string {
  const head = [
    `From: ${o.fromName ? `${encodeWord(o.fromName)} ` : ""}<${o.from ?? "sender@test.local"}>`,
    `To: ${o.to ?? "me@test.local"}`,
    ...(o.cc ? [`Cc: ${o.cc}`] : []),
    `Subject: ${encodeWord(o.subject ?? "제목")}`,
    `Date: ${o.date ?? "Fri, 16 Oct 2026 09:00:00 +0900"}`,
    `Message-ID: <${Math.random().toString(36).slice(2)}@test.local>`,
    "MIME-Version: 1.0",
  ];
  const textPart = (type: string, body: string) => [`Content-Type: ${type}; charset=utf-8`, "Content-Transfer-Encoding: base64", "", b64(body)].join("\r\n");
  const body: string[] = [];
  if (o.text !== undefined) body.push(textPart("text/plain", o.text));
  if (o.html !== undefined) body.push(textPart("text/html", o.html));
  if (body.length === 0) body.push(textPart("text/plain", "본문"));

  const atts = o.attachments ?? [];
  if (atts.length === 0 && body.length === 1) return [...head, body[0]].join("\r\n");

  const parts = [...body];
  for (const a of atts) {
    parts.push(
      [
        `Content-Type: ${a.contentType}; name="${encodeWord(a.filename)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: ${a.inline ? "inline" : "attachment"}; filename="${encodeWord(a.filename)}"`,
        ...(a.cid ? [`Content-ID: <${a.cid}>`] : []),
        "",
        a.content.toString("base64"),
      ].join("\r\n"),
    );
  }
  const boundary = "=_bench_boundary_1";
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts.flatMap((p) => [`--${boundary}`, p]), `--${boundary}--`, ""].join("\r\n");
}
