import { describe, expect, it } from "vitest";
import { DEVICE_STATUS, formatDeviceTime, sortDevices, type ClientDeviceRow } from "./devices";
import { cardTitle, isUidReady, normalizeUid, uidError } from "./nfcCards";

describe("카드 번호 입력", () => {
  it("공백·콜론·하이픈을 없애고 대문자로 바꾼다 (서버와 같은 규칙)", () => {
    expect(normalizeUid(" 0b:9f-51 5d ")).toBe("0B9F515D".toUpperCase());
  });

  it.each(["0B9F515D", "0b:9f:51:5d", "04A1B2C3D4E5F6", "04A1B2C3D4E5F6A7B8C9"])("올바른 번호: %s", (v) => {
    expect(uidError(v)).toBeNull();
    expect(isUidReady(v)).toBe(true);
  });

  it("입력 전에는 안내도 오류도 없고 등록은 막힌다", () => {
    expect(uidError("")).toBeNull();
    expect(uidError("  ")).toBeNull();
    expect(isUidReady("")).toBe(false);
  });

  it("16진수가 아니거나 길이가 맞지 않으면 안내", () => {
    expect(uidError("ZZZZ1234")).toMatch(/0-9, A-F/);
    expect(uidError("0B9F51")).toMatch(/8, 14, 20/);
    expect(isUidReady("0B9F51")).toBe(false);
    expect(isUidReady("ZZZZ1234")).toBe(false);
  });

  it("목록 제목은 이름과 끝 4자리만 쓴다", () => {
    expect(cardTitle({ label: "사원증", uid_last4: "515D" })).toBe("사원증 · …515D");
    expect(cardTitle({ label: "", uid_last4: "515D" })).toBe("이름 없음 · …515D");
  });
});

const row = (id: number, status: ClientDeviceRow["status"]): ClientDeviceRow => ({
  id, name: `PC${id}`, public_key_short: "A1A1A1A1", status, approved_by: null, approved_by_name: null,
  approved_at: null, last_seen_at: null, last_ip: null, created_at: "2026-10-17T00:00:00Z",
});

describe("기기 목록", () => {
  it("승인 대기 → 사용 중 → 사용 중지 순, 같은 상태는 최근 것부터", () => {
    const sorted = sortDevices([row(1, "revoked"), row(2, "approved"), row(3, "pending"), row(4, "approved"), row(5, "pending")]);
    expect(sorted.map((d) => d.id)).toEqual([5, 3, 4, 2, 1]);
  });

  it("원본 배열은 바꾸지 않는다", () => {
    const input = [row(1, "revoked"), row(2, "pending")];
    sortDevices(input);
    expect(input.map((d) => d.id)).toEqual([1, 2]);
  });

  it("상태 표시 문구", () => {
    expect(DEVICE_STATUS.pending.label).toBe("승인 대기");
    expect(DEVICE_STATUS.approved.label).toBe("사용 중");
    expect(DEVICE_STATUS.revoked.label).toBe("사용 중지");
  });

  it("시각 표시: 값이 없거나 이상하면 '-'", () => {
    expect(formatDeviceTime(null)).toBe("-");
    expect(formatDeviceTime("not a date")).toBe("-");
    expect(formatDeviceTime("2026-10-17T10:22:00")).toBe("2026-10-17 10:22");
  });
});
