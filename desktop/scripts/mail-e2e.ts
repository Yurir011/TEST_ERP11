/**
 * 메일 종단 점검 (개발용): 암호화(TLS) 가짜 IMAP 서버를 띄우고, 실제 앱을 점검 모드(--smoke)로 실행해
 * 앱의 IPC 통로 → 접속 → 동기화 → 본문 정리까지 확인한다. 실제 메일 서버에는 접속하지 않는다.
 *
 *   개발 실행:   npx tsx scripts/mail-e2e.ts
 *   묶은 앱:     npx tsx scripts/mail-e2e.ts --exe "release/win-unpacked/BENCH ERP.exe"
 *
 * 앱은 인증서 검증을 켠 채로 접속하므로, 가짜 서버의 자체 서명 인증서를 NODE_EXTRA_CA_CERTS 로만 신뢰시킨다(앱 코드에는 예외가 없다).
 */
import { spawn } from "node:child_process";
import path from "node:path";

import { ImapFlow } from "imapflow";

import { buildRaw, startFakeImap } from "../src/mail/fakeImap.testutil";

const root = path.join(__dirname, "..");
const exeIndex = process.argv.indexOf("--exe");
const noCa = process.argv.includes("--no-ca"); // 대조 실험: 인증서를 신뢰시키지 않으면 접속이 막혀야 한다 (검증이 실제로 켜져 있다는 증거)
const exe = exeIndex >= 0 ? path.resolve(process.argv[exeIndex + 1]) : null;

const hour = 3_600_000;
const messages = [
  { raw: buildRaw({ subject: "한글 제목 메일", fromName: "홍길동", from: "hong@test.local", text: "안녕하세요. 본문입니다." }), internaldate: new Date(Date.now() - 3 * hour) },
  { raw: buildRaw({ subject: "스크립트가 든 메일", html: '<p>안녕하세요</p><script>alert(1)</script><img src="https://track.test/p.gif">' }), internaldate: new Date(Date.now() - 2 * hour) },
  {
    raw: buildRaw({ subject: "첨부 메일", html: "<p>견적서 첨부</p>", attachments: [{ filename: "견적서.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4 fake") }] }),
    internaldate: new Date(Date.now() - 1 * hour),
  },
];

async function main(): Promise<number> {
  const server = await startFakeImap(messages, { Sent: "\\Sent" }, { secure: true });
  const cert = path.join(root, "node_modules", "hoodiecrow-imap", "cert", "server.crt");
  const env: NodeJS.ProcessEnv = { ...process.env, BENCH_SMOKE_MAIL: JSON.stringify({ host: "127.0.0.1", port: server.port, user: server.user, pass: server.pass })};
  if (!noCa) env.NODE_EXTRA_CA_CERTS = cert;
  delete env.ELECTRON_RUN_AS_NODE;

  const [cmd, args] = exe ? [exe, ["--smoke"]] : [require("electron") as string, [".", "--smoke"]];
  console.log(`[E2E] 가짜 IMAP(TLS) 127.0.0.1:${server.port} — 앱 실행: ${exe ?? "개발 실행(electron .)"}`);
  const code = await new Promise<number>((resolve) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const onData = (d: Buffer) => (out += d.toString());
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (c) => {
      for (const line of out.split(/\r?\n/)) if (/\[Smoke\].*(통과|실패|결과)/.test(line) && /(\[메일\]|결과|실패)/.test(line)) console.log(line.replace(/^\S+\s+\S+\s+\[Main\]\s*/, ""));
      resolve(c ?? 1);
    });
  });

  // 앱이 메일을 열었으니 서버에도 읽음 표시가 가 있어야 한다 (열어 본 두 통은 읽음, 안 연 한 통은 안 읽음)
  let seenCount = -1;
  const c = new ImapFlow({ host: "127.0.0.1", port: server.port, secure: true, auth: { user: server.user, pass: server.pass }, logger: false, tls: { rejectUnauthorized: false } });
  await c.connect();
  const lock = await c.getMailboxLock("INBOX");
  try {
    seenCount = 0;
    for await (const m of c.fetch("1:*", { flags: true })) if (m.flags?.has("\\Seen")) seenCount++;
  } finally {
    lock.release();
    await c.logout();
  }
  await server.close();
  const serverOk = seenCount === 2;
  console.log(`[E2E] ${serverOk ? "통과" : "실패"}: 서버에 읽음 표시가 반영됨 (읽음 ${seenCount}/3, 기대 2)`);
  console.log(`[E2E] 앱 종료 코드 ${code}`);
  return code === 0 && serverOk ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => {
  console.error(e);
  process.exit(1);
});
