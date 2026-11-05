// 패스키(지문·얼굴 로그인): 브라우저의 WebAuthn(navigator.credentials)과 서버 /api/passkeys 를 이어 준다.
// 서버가 주고받는 값은 JSON 이라 바이트 값(challenge, id 등)은 base64url 글자로 오가며, 여기서 바이트로 바꿔 브라우저에 넘긴다.
import { ApiError, apiGet, apiPost } from "./api";
import { getBenchClient } from "./desktop";
import { logDebug, logError } from "./logger";

export interface PasskeyInfo {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export function bytesToB64u(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uToBytes(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

interface CredentialDescriptorJson {
  id: string;
  type: PublicKeyCredentialType;
  transports?: AuthenticatorTransport[];
}

/** 서버가 주는 등록 옵션(JSON). 바이트 값은 base64url 글자다. */
export interface CreationOptionsJson {
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: CredentialDescriptorJson[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
}

/** 서버가 주는 로그인 옵션(JSON). */
export interface RequestOptionsJson {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: CredentialDescriptorJson[];
  userVerification?: UserVerificationRequirement;
}

function descriptor(d: CredentialDescriptorJson): PublicKeyCredentialDescriptor {
  return { id: b64uToBytes(d.id), type: d.type, transports: d.transports };
}

export function toCreationOptions(json: CreationOptionsJson): PublicKeyCredentialCreationOptions {
  return {
    rp: json.rp,
    user: { id: b64uToBytes(json.user.id), name: json.user.name, displayName: json.user.displayName },
    challenge: b64uToBytes(json.challenge),
    pubKeyCredParams: json.pubKeyCredParams,
    timeout: json.timeout,
    excludeCredentials: json.excludeCredentials?.map(descriptor),
    authenticatorSelection: json.authenticatorSelection,
    attestation: json.attestation,
  };
}

export function toRequestOptions(json: RequestOptionsJson): PublicKeyCredentialRequestOptions {
  return {
    challenge: b64uToBytes(json.challenge),
    timeout: json.timeout,
    rpId: json.rpId,
    allowCredentials: json.allowCredentials?.map(descriptor),
    userVerification: json.userVerification,
  };
}

/** 기기가 만든 등록 결과를 서버가 읽는 JSON 으로 바꾼다. */
export function attestationToJson(cred: PublicKeyCredential): Record<string, unknown> {
  const response = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bytesToB64u(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bytesToB64u(response.clientDataJSON),
      attestationObject: bytesToB64u(response.attestationObject),
      transports: response.getTransports?.(),
    },
  };
}

/** 기기가 한 로그인 서명을 서버가 읽는 JSON 으로 바꾼다. */
export function assertionToJson(cred: PublicKeyCredential): Record<string, unknown> {
  const response = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bytesToB64u(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bytesToB64u(response.clientDataJSON),
      authenticatorData: bytesToB64u(response.authenticatorData),
      signature: bytesToB64u(response.signature),
      userHandle: response.userHandle ? bytesToB64u(response.userHandle) : undefined,
    },
  };
}

/** 이 화면에서 패스키를 쓸 수 있는가: 보안 연결(HTTPS)이고 브라우저가 지원하며, 데스크톱 앱 안이 아닐 때. */
export function passkeySupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && typeof window.PublicKeyCredential !== "undefined" && !getBenchClient();
}

/** 서버에 패스키 설정(도메인)이 되어 있는가. 설정이 없거나 서버에 닿지 못하면 false. */
export async function fetchPasskeyEnabled(): Promise<boolean> {
  try {
    return (await apiGet<{ enabled: boolean }>("/api/passkeys/status")).enabled;
  } catch (err) {
    logError("Passkey", "패스키 사용 가능 여부 조회 실패", err);
    return false;
  }
}

interface OptionsResponse<T> {
  challenge_id: string;
  options: T;
}

/** 이 기기에 새 패스키를 만들어 서버에 등록한다 (로그인한 상태에서). 기기가 지문·얼굴 확인을 요청한다. */
export async function registerPasskey(name: string): Promise<PasskeyInfo> {
  logDebug("Passkey", "등록 시작");
  const { challenge_id, options } = await apiPost<OptionsResponse<CreationOptionsJson>>("/api/passkeys/register/options");
  const cred = (await navigator.credentials.create({ publicKey: toCreationOptions(options) })) as PublicKeyCredential | null;
  if (!cred) throw new Error("패스키를 만들지 못했습니다.");
  const saved = await apiPost<PasskeyInfo>("/api/passkeys/register/verify", { challenge_id, credential: attestationToJson(cred), name });
  logDebug("Passkey", `등록 완료: id=${saved.id}`);
  return saved;
}

/** 패스키로 로그인한다. 서버가 주는 로그인 토큰을 돌려준다 (저장은 호출하는 쪽이 한다). */
export async function loginWithPasskey(): Promise<string> {
  logDebug("Passkey", "로그인 시작");
  const { challenge_id, options } = await apiPost<OptionsResponse<RequestOptionsJson>>("/api/passkeys/login/options");
  const cred = (await navigator.credentials.get({ publicKey: toRequestOptions(options) })) as PublicKeyCredential | null;
  if (!cred) throw new Error("패스키를 확인하지 못했습니다.");
  const { access_token } = await apiPost<{ access_token: string }>("/api/passkeys/login/verify", { challenge_id, credential: assertionToJson(cred) });
  logDebug("Passkey", "로그인 성공");
  return access_token;
}

/** 사용자에게 보여 줄 오류 문구. 지문 확인을 취소한 경우는 오류가 아니라 안내로 말한다. */
export function passkeyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "취소했거나 시간이 지났습니다. 다시 시도해주세요.";
  if (name === "InvalidStateError") return "이 기기에는 이미 패스키가 등록되어 있습니다.";
  if (name === "NotSupportedError" || name === "SecurityError") return "이 화면에서는 패스키를 쓸 수 없습니다. 보안 연결(HTTPS)로 접속했는지 확인해주세요.";
  return "패스키를 사용하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

/** 패스키 등록 때 입력칸에 미리 넣어 줄 기기 이름 (직원이 고칠 수 있다). */
export function defaultPasskeyName(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return "내 iPhone";
  if (/iPad/i.test(userAgent)) return "내 iPad";
  if (/Android/i.test(userAgent)) return "내 안드로이드 폰";
  if (/Windows/i.test(userAgent)) return "내 Windows PC";
  if (/Macintosh|Mac OS/i.test(userAgent)) return "내 Mac";
  return "내 기기";
}
