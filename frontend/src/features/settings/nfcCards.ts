// NFC 카드 등록 화면의 순수 함수와 타입 (화면과 분리해 테스트한다). 서버 규칙: services/nfc.py

export interface NfcCard {
  id: number;
  user_id: number;
  uid_last4: string;
  label: string;
  is_active: boolean;
  registered_at: string;
  last_used_at: string | null;
  deactivated_at: string | null;
}

const VALID_HEX_LENGTHS = [8, 14, 20]; // 4, 7, 10바이트

/** 공백·콜론·하이픈을 없애고 대문자 16진수로 만든다 (서버와 같은 규칙). */
export function normalizeUid(raw: string): string {
  return raw.replace(/[\s:-]/g, "").toUpperCase();
}

/** 입력한 카드 번호에 문제가 있으면 안내 문구, 올바르거나 아직 입력 전이면 null. 등록 가능 여부는 isUidReady 로 본다. */
export function uidError(raw: string): string | null {
  const uid = normalizeUid(raw);
  if (!uid) return null; // 아직 입력 전
  if (!/^[0-9A-F]+$/.test(uid)) return "카드 번호는 0-9, A-F 만 입력할 수 있습니다.";
  if (!VALID_HEX_LENGTHS.includes(uid.length)) return "카드 번호는 8, 14, 20자리여야 합니다 (4, 7, 10바이트).";
  return null;
}

export function isUidReady(raw: string): boolean {
  const uid = normalizeUid(raw);
  return uid.length > 0 && uidError(raw) === null;
}

export function cardTitle(card: Pick<NfcCard, "label" | "uid_last4">): string {
  return `${card.label || "이름 없음"} · …${card.uid_last4}`;
}
