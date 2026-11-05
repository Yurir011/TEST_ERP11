import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { b64uToBytes, bytesToB64u, defaultPasskeyName, passkeyErrorMessage, toCreationOptions, toRequestOptions } from "./passkey";

describe("base64url", () => {
  it("바이트와 글자를 오가도 값이 같다 (+, /, 끝의 = 가 들어가는 값 포함)", () => {
    const samples = [new Uint8Array([]), new Uint8Array([0]), new Uint8Array([251, 255, 254]), new Uint8Array(Array.from({ length: 70 }, (_, i) => (i * 37) % 256))];
    for (const bytes of samples) {
      const text = bytesToB64u(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(b64uToBytes(text))).toEqual(Array.from(bytes));
    }
  });

  it("서버(py_webauthn)가 주는 글자를 읽는다", () => {
    expect(Array.from(b64uToBytes("-_8"))).toEqual([251, 255]);
  });
});

describe("옵션 변환", () => {
  it("등록 옵션의 challenge·user.id·제외 목록을 바이트로 바꾸고 나머지는 그대로 둔다", () => {
    const out = toCreationOptions({
      rp: { id: "erp.test", name: "BENCH ERP" },
      user: { id: bytesToB64u(new Uint8Array([49, 50])), name: "a@b.c", displayName: "이도현" },
      challenge: bytesToB64u(new Uint8Array([1, 2, 3])),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      excludeCredentials: [{ id: bytesToB64u(new Uint8Array([9])), type: "public-key" }],
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
    });
    expect(Array.from(out.challenge as Uint8Array)).toEqual([1, 2, 3]);
    expect(Array.from(out.user.id as Uint8Array)).toEqual([49, 50]);
    expect(Array.from(out.excludeCredentials![0].id as Uint8Array)).toEqual([9]);
    expect(out.rp.id).toBe("erp.test");
    expect(out.authenticatorSelection?.userVerification).toBe("required");
  });

  it("로그인 옵션은 허용 목록이 없어도 변환된다 (이메일 없이 로그인)", () => {
    const out = toRequestOptions({ challenge: bytesToB64u(new Uint8Array([7])), rpId: "erp.test", userVerification: "required" });
    expect(Array.from(out.challenge as Uint8Array)).toEqual([7]);
    expect(out.allowCredentials).toBeUndefined();
    expect(out.rpId).toBe("erp.test");
  });
});

describe("passkeyErrorMessage", () => {
  it("서버 안내 문구는 그대로, 지문 확인 취소는 안내로 말한다", () => {
    expect(passkeyErrorMessage(new ApiError(400, "패스키는 최대 5개까지 등록할 수 있습니다."))).toBe("패스키는 최대 5개까지 등록할 수 있습니다.");
    expect(passkeyErrorMessage(new DOMException("x", "NotAllowedError"))).toContain("취소했거나");
    expect(passkeyErrorMessage(new DOMException("x", "InvalidStateError"))).toContain("이미 패스키가 등록");
    expect(passkeyErrorMessage(new DOMException("x", "SecurityError"))).toContain("HTTPS");
    expect(passkeyErrorMessage(new Error("boom"))).toContain("사용하지 못했습니다");
  });
});

describe("defaultPasskeyName", () => {
  it("접속한 기기 종류로 이름을 추천한다", () => {
    expect(defaultPasskeyName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("내 iPhone");
    expect(defaultPasskeyName("Mozilla/5.0 (Linux; Android 15; SM-S921N)")).toBe("내 안드로이드 폰");
    expect(defaultPasskeyName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("내 Windows PC");
    expect(defaultPasskeyName("")).toBe("내 기기");
  });
});
