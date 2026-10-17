/**
 * 이 PC 의 기기 키: 처음 실행할 때 Ed25519 키 쌍을 만들어 비밀키는 운영체제 보안 저장소(Windows DPAPI / macOS Keychain /
 * Linux libsecret, Electron safeStorage)로 암호화해 둔다. 서버에는 공개키만 보낸다.
 * 비밀키는 이 파일(main 프로세스)에서만 쓰고 화면(웹)에는 절대 넘기지 않는다. 화면은 서명 결과도 받지 않는다 (3단계 카드 로그인은 main 이 직접 서명).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { type Logger, silentLogger } from "./log";

/** 비밀키를 감싸는 저장소. Electron 에서는 safeStorage 를 연결한다. */
export interface SecretStore {
  available(): boolean;
  encrypt(plain: Buffer): Buffer;
  decrypt(cipher: Buffer): Buffer;
}

export interface DeviceKey {
  publicKeyHex: string; // Ed25519 공개키 32바이트 (16진수 64자)
  sign(message: Buffer): string; // 서명 (16진수 128자)
}

interface KeyFile {
  version: 1;
  publicKey: string;
  privateKey: string; // base64 (encrypted 가 true 면 보안 저장소로 암호화된 값)
  encrypted: boolean;
}

const SPKI_ED25519_PREFIX_LENGTH = 12; // DER 접두부 12바이트 뒤에 공개키 32바이트

function publicKeyHexOf(publicKey: crypto.KeyObject): string {
  const der = publicKey.export({ format: "der", type: "spki" });
  return Buffer.from(der).subarray(SPKI_ED25519_PREFIX_LENGTH).toString("hex");
}

function toDeviceKey(privateDer: Buffer): DeviceKey {
  const privateKey = crypto.createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
  const publicKey = crypto.createPublicKey(privateKey);
  return {
    publicKeyHex: publicKeyHexOf(publicKey),
    sign: (message) => crypto.sign(null, message, privateKey).toString("hex"),
  };
}

/** 공개키(16진수)로 서명을 확인한다 (테스트와 서버 검증 규칙 확인용). */
export function verifySignature(publicKeyHex: string, message: Buffer, signatureHex: string): boolean {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyHex, "hex")]);
  const key = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  return crypto.verify(null, message, key, Buffer.from(signatureHex, "hex"));
}

/**
 * 키 파일을 읽고, 없거나 깨졌으면 새로 만든다. 보안 저장소가 없는 환경(키링 없는 Linux 등)에서는
 * 암호화 없이 소유자만 읽을 수 있는 파일(0600)로 저장하고 경고를 남긴다.
 */
export function loadOrCreateDeviceKey(file: string, store: SecretStore, log: Logger = silentLogger): DeviceKey {
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf-8")) as KeyFile;
    const raw = Buffer.from(saved.privateKey, "base64");
    const der = saved.encrypted ? store.decrypt(raw) : raw;
    const key = toDeviceKey(der);
    if (key.publicKeyHex !== saved.publicKey) throw new Error("공개키가 맞지 않습니다");
    return key;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`[Device] 기기 키를 읽지 못해 새로 만듭니다 (이 PC 는 서버에서 다시 승인받아야 합니다): ${(err as Error).message}`);
    }
  }

  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const der = Buffer.from(privateKey.export({ format: "der", type: "pkcs8" }));
  const encrypted = store.available();
  if (!encrypted) log.warn("[Device] 운영체제 보안 저장소를 쓸 수 없어 기기 키를 암호화하지 않고 저장합니다 (파일 권한으로만 보호).");
  const key = toDeviceKey(der);
  const body: KeyFile = {
    version: 1,
    publicKey: key.publicKeyHex,
    privateKey: (encrypted ? store.encrypt(der) : der).toString("base64"),
    encrypted,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body), { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(tmp, file);
  log.info(`[Device] 기기 키 생성: 공개키 ${key.publicKeyHex.slice(0, 8).toUpperCase()}…, 암호화 ${encrypted ? "예" : "아니오"}`);
  return key;
}

export type DeviceStatusName = "pending" | "approved" | "revoked";
export type RegisterResult = { ok: true; status: DeviceStatusName } | { ok: false; error: string };

export function defaultDeviceName(): string {
  return `${os.hostname()} (${os.userInfo().username})`.slice(0, 100);
}

/** 서버에 이 기기를 등록하거나 현재 상태를 묻는다 (POST /api/devices/register, 로그인 불필요). */
export async function registerDevice(
  serverUrl: string,
  key: DeviceKey,
  name: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<RegisterResult> {
  try {
    const res = await fetchImpl(`${serverUrl}/api/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, public_key: key.publicKeyHex }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    if (res.status === 429) return { ok: false, error: "승인 대기 중인 기기가 너무 많습니다. 관리자에게 문의하세요." };
    if (!res.ok) return { ok: false, error: `기기 등록 요청이 거절되었습니다 (HTTP ${res.status}).` };
    const body = (await res.json()) as { status?: string };
    if (body.status === "pending" || body.status === "approved" || body.status === "revoked") return { ok: true, status: body.status };
    return { ok: false, error: "서버 응답을 이해할 수 없습니다." };
  } catch {
    return { ok: false, error: "서버에 연결할 수 없습니다." };
  }
}
