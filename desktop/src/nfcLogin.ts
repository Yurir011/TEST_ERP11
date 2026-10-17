/**
 * 카드 로그인 요청 (main 프로세스 전용). 카드 번호를 읽으면 서버에서 1회용 확인값(nonce)을 받아
 * 이 PC 의 기기 비밀키로 서명해 로그인을 요청한다. 비밀키와 서명은 화면(웹)에 넘기지 않고, 화면은 결과(토큰 또는 안내 문구)만 받는다.
 *
 * 서명하는 글은 서버(backend/app/services/nfc_signature.py)와 같아야 한다: `bench-nfc-login|<nonce>|<카드 번호>`
 */
import type { DeviceKey } from "./device";

export const LOGIN_MESSAGE_PREFIX = "bench-nfc-login";

export function loginMessage(nonce: string, uid: string): Buffer {
  return Buffer.from(`${LOGIN_MESSAGE_PREFIX}|${nonce}|${uid}`);
}

export type NfcLoginResult = { ok: true; token: string } | { ok: false; error: string };

const NETWORK_ERROR = "서버에 연결할 수 없습니다.";

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; json: Record<string, unknown> } | null> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } catch {
    return null;
  }
}

/** 서버가 준 안내 문구(detail)를 꺼낸다. 없거나 형식이 다르면 상태 코드로 만든 기본 문구. */
function messageOf(r: { status: number; json: Record<string, unknown> }): string {
  const detail = r.json.detail;
  return typeof detail === "string" && detail ? detail : `카드 로그인에 실패했습니다 (HTTP ${r.status}).`;
}

export async function performNfcLogin(
  serverUrl: string,
  key: DeviceKey,
  uid: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<NfcLoginResult> {
  const challenge = await postJson(fetchImpl, `${serverUrl}/api/auth/nfc/challenge`, { public_key: key.publicKeyHex }, timeoutMs);
  if (!challenge) return { ok: false, error: NETWORK_ERROR };
  if (challenge.status !== 200) return { ok: false, error: messageOf(challenge) };
  const nonce = challenge.json.nonce;
  if (typeof nonce !== "string" || !nonce) return { ok: false, error: "서버 응답을 이해할 수 없습니다." };

  const login = await postJson(
    fetchImpl,
    `${serverUrl}/api/auth/nfc/login`,
    { public_key: key.publicKeyHex, nonce, uid, signature: key.sign(loginMessage(nonce, uid)) },
    timeoutMs,
  );
  if (!login) return { ok: false, error: NETWORK_ERROR };
  if (login.status !== 200) return { ok: false, error: messageOf(login) };
  const token = login.json.access_token;
  if (typeof token !== "string" || !token) return { ok: false, error: "서버 응답을 이해할 수 없습니다." };
  return { ok: true, token };
}
