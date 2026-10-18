/**
 * 메일 계정 설정 저장 (main 프로세스 전용).
 * 비밀번호는 Electron safeStorage(Windows 자격 증명 암호화)로 암호화해 이 PC 의 파일에만 두고, 서버와 화면에는 절대 보내지 않는다.
 * 암호화를 쓸 수 없는 PC 에서는 평문으로 저장하지 않고 저장을 거부한다.
 */
import fs from "node:fs";
import path from "node:path";

import type { SecretStore } from "../device";
import { type Logger, silentLogger } from "../log";
import type { MailAccountInfo, MailAccountInput } from "./types";

export interface MailCredentials extends MailAccountInfo {
  password: string;
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const NO_UNSAFE = /[\r\n\0]/;

export function validateAccountInput(input: unknown): { ok: true; value: Required<MailAccountInput> } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "입력 형식이 올바르지 않습니다." };
  const i = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const email = str(i.email);
  const username = str(i.username) || email;
  const imapHost = str(i.imapHost).toLowerCase();
  const smtpHost = str(i.smtpHost).toLowerCase();
  const imapPort = Number(i.imapPort);
  const smtpPort = Number(i.smtpPort);
  const password = typeof i.password === "string" ? i.password : "";
  const saveToSent = i.saveToSent === true;

  if (!EMAIL_RE.test(email) || NO_UNSAFE.test(email)) return { ok: false, error: "이메일 주소 형식이 올바르지 않습니다." };
  if (!username || NO_UNSAFE.test(username) || username.length > 255) return { ok: false, error: "아이디가 올바르지 않습니다." };
  if (!HOST_RE.test(imapHost)) return { ok: false, error: "받는 메일(IMAP) 서버 주소가 올바르지 않습니다." };
  if (!HOST_RE.test(smtpHost)) return { ok: false, error: "보내는 메일(SMTP) 서버 주소가 올바르지 않습니다." };
  if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) return { ok: false, error: "IMAP 포트가 올바르지 않습니다." };
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) return { ok: false, error: "SMTP 포트가 올바르지 않습니다." };
  if (!password) return { ok: false, error: "비밀번호를 입력해 주세요." };
  if (password.length > 512 || /[\r\n\0]/.test(password)) return { ok: false, error: "비밀번호 형식이 올바르지 않습니다." };
  return { ok: true, value: { email, username, imapHost, imapPort, smtpHost, smtpPort, saveToSent, password } };
}

export class MailAccountStore {
  constructor(
    private readonly file: string,
    private readonly secrets: SecretStore,
    private readonly log: Logger = silentLogger,
  ) {}

  /** 비밀번호를 뺀 설정. 없으면 null */
  load(): MailAccountInfo | null {
    const raw = this.readRaw();
    if (!raw) return null;
    const { email, username, imapHost, imapPort, smtpHost, smtpPort } = raw;
    return { email, username, imapHost, imapPort, smtpHost, smtpPort, saveToSent: raw.saveToSent === true };
  }

  /** 접속에 쓸 정보(비밀번호 포함). main 프로세스 안에서만 쓴다. 복호화할 수 없으면 null */
  credentials(): MailCredentials | null {
    const raw = this.readRaw();
    if (!raw) return null;
    if (!this.secrets.available()) {
      this.log.warn("[Mail] 암호화 저장소를 쓸 수 없어 저장된 비밀번호를 읽지 못했습니다");
      return null;
    }
    try {
      const password = this.secrets.decrypt(Buffer.from(raw.passwordEnc, "base64")).toString("utf8");
      const { passwordEnc: _drop, ...info } = raw;
      void _drop;
      return { ...info, password };
    } catch {
      this.log.warn("[Mail] 저장된 비밀번호를 풀지 못했습니다 (다른 Windows 계정이거나 손상됨). 계정을 다시 등록해야 합니다");
      return null;
    }
  }

  save(input: Required<MailAccountInput>): { ok: true } | { ok: false; error: string } {
    if (!this.secrets.available()) {
      return { ok: false, error: "이 PC 에서는 비밀번호를 안전하게 저장할 수 없어 계정을 등록할 수 없습니다. Windows 로그인 상태에서 다시 시도해 주세요." };
    }
    const { password, ...info } = input;
    const passwordEnc = this.secrets.encrypt(Buffer.from(password, "utf8")).toString("base64");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ ...info, passwordEnc }, null, 2), { mode: 0o600 });
    this.log.info(`[Mail] 계정 저장: ${info.email} (IMAP ${info.imapHost}:${info.imapPort}, SMTP ${info.smtpHost}:${info.smtpPort})`);
    return { ok: true };
  }

  remove(): void {
    fs.rmSync(this.file, { force: true });
    this.log.info("[Mail] 계정 설정 삭제");
  }

  private readRaw(): (MailAccountInfo & { passwordEnc: string }) | null {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, unknown>;
      const ok =
        typeof j.email === "string" && typeof j.username === "string" && typeof j.imapHost === "string" && typeof j.smtpHost === "string" &&
        typeof j.imapPort === "number" && typeof j.smtpPort === "number" && typeof j.passwordEnc === "string";
      return ok ? (j as unknown as MailAccountInfo & { passwordEnc: string }) : null; // saveToSent 는 예전 파일에 없을 수 있다(없으면 꺼짐)
    } catch {
      return null;
    }
  }
}
