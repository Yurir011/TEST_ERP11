/**
 * 메일 보내기 (main 프로세스 전용). 직원 본인 계정으로 SMTP(465/SSL)에 접속해 보낸다.
 * 보낼 메일 원문(MIME)은 한 번만 만들어서, 실제 발송과 "보낸메일함에 저장"에 같은 것을 쓴다.
 */
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import type { MailCredentials } from "./account";
import type { ParsedAddress } from "./address";
import { type Logger, silentLogger } from "../log";
import { MailError } from "./sync";

export interface OutgoingAttachment {
  filename: string;
  /** 사용자가 고른 파일의 경로(준비된 첨부만 들어온다) */
  path: string;
}

export interface OutgoingMail {
  fromName: string;
  /** 보내는 사람 주소. 없으면 로그인한 계정의 주소. 서버가 허용하는 주소(내 계정·등록된 별칭)여야 실제로 나간다 */
  fromAddress?: string;
  to: ParsedAddress[];
  cc: ParsedAddress[];
  bcc: ParsedAddress[];
  subject: string;
  text: string;
  attachments: OutgoingAttachment[];
  /** 답장일 때: 원본 메일의 Message-ID 와 대화 이어 붙이기용 References */
  inReplyTo?: string;
  references?: string[];
}

export interface SentMail {
  messageId: string;
  /** 서버에 보낸 원문 (보낸메일함 저장에 쓴다) */
  raw: Buffer;
}

export interface SenderDeps {
  credentials: () => MailCredentials | null;
  log?: Logger;
  /** 테스트에서만 쓴다 (가짜 서버는 암호화가 없거나 자체 서명 인증서다). 운영에서는 비워 둔다 */
  transportOverrides?: Partial<SMTPTransport.Options>;
}

const addr = (a: ParsedAddress) => ({ name: a.name, address: a.address });

/** 보내기 오류를 사용자가 이해할 수 있는 문구로 바꾼다. 서버 응답 원문이나 비밀번호는 담지 않는다. */
export function describeSmtpError(err: unknown): MailError {
  const e = err as { code?: string; responseCode?: number; command?: string; message?: string };
  const code = e?.code ?? "";
  const rc = e?.responseCode ?? 0;
  if (code === "EAUTH" || rc === 535 || rc === 534) {
    return new MailError("보내는 메일 서버 로그인에 실패했습니다. 메일 계정 설정에서 이메일·비밀번호를 확인하세요. (외부 프로그램(SMTP) 사용 설정이 꺼져 있을 수도 있습니다.)", "auth");
  }
  if (rc === 552 || /exceed|too large|size limit/i.test(e?.message ?? "")) {
    return new MailError("메일 크기가 서버 한도를 넘었습니다. 첨부 파일을 줄여 주세요.", "size");
  }
  if ((rc === 550 || rc === 551 || rc === 553 || rc === 554) && /MAIL FROM/i.test(e?.command ?? "")) {
    return new MailError("서버가 보내는 사람 주소를 허용하지 않았습니다. 로그인한 계정 또는 서버에 등록된 별칭 주소만 보내는 사람으로 쓸 수 있습니다.", "sender");
  }
  if (code === "EENVELOPE" || ((rc === 550 || rc === 551 || rc === 553 || rc === 554) && /RCPT/i.test(e?.command ?? ""))) {
    return new MailError("받는 사람 주소를 서버가 받아들이지 않았습니다. 주소를 확인하세요.", "recipient");
  }
  if (/CERT|SSL|TLS|self.signed|unable to verify/i.test(code) || /certificate|SSL|TLS/i.test(e?.message ?? "")) {
    return new MailError("메일 서버의 보안 인증서를 확인할 수 없어 연결을 막았습니다. 서버 주소를 확인하세요.", "tls");
  }
  if (code === "EDNS" || code === "ENOTFOUND" || code === "EAI_AGAIN") return new MailError("메일 서버 주소를 찾을 수 없습니다. 서버 주소와 인터넷 연결을 확인하세요.", "network");
  if (["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ETIMEOUT", "ESOCKET", "ECONNRESET", "EHOSTUNREACH"].includes(code)) {
    return new MailError("보내는 메일 서버에 연결할 수 없습니다. 포트 번호와 방화벽, 인터넷 연결을 확인하세요.", "network");
  }
  return new MailError(`메일을 보내지 못했습니다.${rc ? ` (서버 응답 코드 ${rc})` : ""} 잠시 후 다시 시도해 주세요.`, "other");
}

export class MailSender {
  private readonly log: Logger;

  constructor(private readonly deps: SenderDeps) {
    this.log = deps.log ?? silentLogger;
  }

  /** 보낼 메일 원문(MIME)을 만든다. Bcc 는 머리글에 넣지 않는다. */
  async build(creds: MailCredentials, mail: OutgoingMail): Promise<{ raw: Buffer; messageId: string }> {
    const fromAddress = mail.fromAddress ?? creds.email;
    const domain = fromAddress.split("@")[1] ?? "localhost";
    const messageId = `<${cryptoRandom()}@${domain}>`;
    const composer = new MailComposer({
      from: { name: mail.fromName, address: fromAddress },
      to: mail.to.map(addr),
      cc: mail.cc.map(addr),
      subject: mail.subject,
      text: mail.text,
      messageId,
      date: new Date(),
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      attachments: mail.attachments.map((a) => ({ filename: a.filename, path: a.path })),
    });
    const raw = await composer.compile().build();
    return { raw, messageId };
  }

  async send(mail: OutgoingMail): Promise<SentMail> {
    const creds = this.deps.credentials();
    if (!creds) throw new MailError("메일 계정이 등록되어 있지 않습니다.", "config");
    const recipients = [...mail.to, ...mail.cc, ...mail.bcc].map((a) => a.address);
    if (recipients.length === 0) throw new MailError("받는 사람을 입력해 주세요.", "recipient");

    const { raw, messageId } = await this.build(creds, mail);
    const transport = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      // 기본(ssl)은 465 처럼 암호화로 바로 접속하고, starttls 는 587 처럼 접속한 뒤 암호화로 바꾼다 (암호화를 못 올리면 보내지 않는다)
      secure: creds.smtpSecurity !== "starttls",
      ...(creds.smtpSecurity === "starttls" ? { requireTLS: true } : {}),
      auth: { user: creds.username, pass: creds.password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
      logger: false,
      ...this.deps.transportOverrides,
    });
    try {
      // 받는 사람(Bcc 포함)은 봉투(envelope)로 지정하고, 머리글에는 To·Cc 만 남는다
      await transport.sendMail({ envelope: { from: mail.fromAddress ?? creds.email, to: recipients }, raw });
      this.log.info(`[Mail] 메일 발송 완료: 받는 사람 ${recipients.length}명, 첨부 ${mail.attachments.length}개, 크기 ${Math.round(raw.length / 1024)}KB`);
      return { messageId, raw };
    } catch (err) {
      const mapped = describeSmtpError(err);
      this.log.warn(`[Mail] 메일 발송 실패: ${mapped.kind} (${(err as { code?: string }).code ?? (err as Error).name}${(err as { responseCode?: number }).responseCode ? ` ${(err as { responseCode?: number }).responseCode}` : ""})`);
      throw mapped;
    } finally {
      transport.close();
    }
  }
}

function cryptoRandom(): string {
  // 메시지 번호용 임의 문자열 (보안 토큰이 아니라 중복만 피하면 된다)
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
}
