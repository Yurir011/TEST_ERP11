/**
 * 메일 종단 점검 (개발용): 암호화(TLS) 가짜 IMAP·SMTP 서버를 띄우고, 실제 앱을 점검 모드(--smoke)로 실행해
 * 앱의 IPC 통로 → 접속 → 동기화 → 본문 정리 → 메일 쓰기·보내기까지 확인한다. 실제 메일 서버에는 접속하지 않는다.
 *
 *   개발 실행:   npx tsx scripts/mail-e2e.ts
 *   묶은 앱:     npx tsx scripts/mail-e2e.ts --exe "release/win-unpacked/BENCH ERP.exe"
 *   대조 실험:   npx tsx scripts/mail-e2e.ts --no-ca   (인증서를 신뢰시키지 않으므로 접속이 막혀야 한다)
 *
 * 앱은 인증서 검증을 켠 채로 접속하므로, 가짜 서버의 자체 서명 인증서를 NODE_EXTRA_CA_CERTS 로만 신뢰시킨다(앱 코드에는 예외가 없다).
 */
import { spawn } from "node:child_process";
import path from "node:path";

import { ImapFlow } from "imapflow";

import { buildRaw, startFakeImap } from "../src/mail/fakeImap.testutil";
import { startFakeSmtp } from "../src/mail/fakeSmtp.testutil";

const root = path.join(__dirname, "..");
const exeIndex = process.argv.indexOf("--exe");
const noCa = process.argv.includes("--no-ca");
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

async function countIn(port: number, user: string, pass: string, mailbox: string, flag?: string): Promise<number> {
  const c = new ImapFlow({ host: "127.0.0.1", port, secure: true, auth: { user, pass }, logger: false, tls: { rejectUnauthorized: false } });
  await c.connect();
  const lock = await c.getMailboxLock(mailbox);
  let n = 0;
  try {
    if (c.mailbox && typeof c.mailbox === "object" && c.mailbox.exists === 0) return 0;
    for await (const m of c.fetch("1:*", { flags: true })) if (!flag || m.flags?.has(flag)) n++;
  } finally {
    lock.release();
    await c.logout();
  }
  return n;
}

async function main(): Promise<number> {
  const imap = await startFakeImap(messages, { Sent: "\\Sent", Trash: "\\Trash", Junk: "\\Junk", Archive: "\\Archive" }, { secure: true });
  const smtp = await startFakeSmtp({ secure: true, rejectRcpt: "nobody@test.local" });
  const cert = path.join(root, "node_modules", "hoodiecrow-imap", "cert", "server.crt");
  const env: NodeJS.ProcessEnv = { ...process.env, BENCH_SMOKE_MAIL: JSON.stringify({ host: "127.0.0.1", port: imap.port, smtpPort: smtp.port, user: imap.user, pass: imap.pass }) };
  if (!noCa) env.NODE_EXTRA_CA_CERTS = cert;
  delete env.ELECTRON_RUN_AS_NODE;

  const [cmd, args] = exe ? [exe, ["--smoke"]] : [require("electron") as string, [".", "--smoke"]];
  console.log(`[E2E] 가짜 IMAP·SMTP(TLS) 127.0.0.1:${imap.port}/${smtp.port} — 앱 실행: ${exe ?? "개발 실행(electron .)"}`);
  const code = await new Promise<number>((resolve) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const onData = (d: Buffer) => (out += d.toString());
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (c) => {
      for (const line of out.split(/\r?\n/)) if (/\[Smoke\].*(통과|실패|결과)/.test(line) && /(\[메일|\[새 메일|결과|실패)/.test(line)) console.log(line.replace(/^\S+\s+\S+\s+\[Main\]\s*/, ""));
      resolve(c ?? 1);
    });
  });

  const results: [string, boolean][] = [];
  const check = (name: string, ok: boolean) => {
    results.push([name, ok]);
    console.log(`[E2E] ${ok ? "통과" : "실패"}: ${name}`);
  };

  // 앱이 메일을 열었으니 서버에도 읽음 표시가 가 있어야 한다 (열어 본 두 통은 읽음, 안 연 한 통은 안 읽음)
  const seen = await countIn(imap.port, imap.user, imap.pass, "INBOX", "\\Seen");
  check(`서버에 읽음 표시가 반영됨 (읽음 ${seen}/3, 기대 2)`, seen === 2);

  if (!noCa) {
    // 보내기: 전달 메일 1통 + 답장 1통만 도착해야 한다 (거절된 메일·잘못된 주소·형식 오류·가짜 첨부 번호는 서버에 닿지 않는다)
    check(`SMTP 서버가 받은 메일은 정확히 2통 (받은 ${smtp.messages.length}통)`, smtp.messages.length === 2);
    const fwd = smtp.messages.find((m) => m.parsed.subject === "Fwd: 첨부 메일");
    const rep = smtp.messages.find((m) => m.parsed.subject === "Re: 첨부 메일");
    check("전달 메일: 한글 이름 첨부(견적서.pdf)가 그대로 가고 받는 사람 봉투에 숨은참조가 있다", !!fwd && fwd.parsed.attachments[0]?.filename === "견적서.pdf" && fwd.parsed.attachments[0].content.toString() === "%PDF-1.4 fake" && fwd.envelope.to.includes("hidden@test.local"));
    check("전달 메일: 숨은참조 주소가 메일 원문 어디에도 없다", !!fwd && !fwd.raw.toString().includes("hidden@test.local"));
    check("전달 메일: 보내는 사람은 내 계정(e2e@test.local)이고 표시 이름이 붙는다", !!fwd && fwd.parsed.from?.value[0].address === "e2e@test.local" && fwd.parsed.from.value[0].name === "점검 담당");
    check("답장 메일: In-Reply-To 가 붙어 대화로 이어진다", !!rep && /^<.+>$/.test(rep.parsed.inReplyTo ?? ""));
    const sentCount = await countIn(imap.port, imap.user, imap.pass, "Sent");
    check(`보낸메일함에 보낸 메일 2통이 저장됨 (저장 ${sentCount}통)`, sentCount === 2);
  }

  if (!noCa) {
    // 메일 정리: 스팸 1통, 보관함 1통(이동 시험 메일), 휴지통은 완전 삭제로 비어 있어야 하고, 받은메일함에는 시험용 메일이 남지 않아야 한다
    const junkCount = await countIn(imap.port, imap.user, imap.pass, "Junk");
    const archiveCount = await countIn(imap.port, imap.user, imap.pass, "Archive");
    const trashCount = await countIn(imap.port, imap.user, imap.pass, "Trash");
    check(`서버의 스팸메일함에 1통 (실제 ${junkCount}통)`, junkCount === 1);
    check(`서버의 보관함에 1통 (실제 ${archiveCount}통)`, archiveCount === 1);
    check(`서버의 휴지통은 완전 삭제로 비어 있음 (실제 ${trashCount}통)`, trashCount === 0);
  }

  await smtp.close();
  await imap.close();
  const bad = results.filter(([, ok]) => !ok).length;
  console.log(`[E2E] 앱 종료 코드 ${code}`);
  return code === 0 && bad === 0 ? 0 : 1;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
