import { describe, expect, it } from "vitest";
import { bizRegOcrUpdates, formatBizRegNo, normalizeClientName, toFormValues, toPayload } from "./clientForm";
import { EMPTY_CLIENT_FORM, type BusinessRegOcrResult, type Client } from "./types";

describe("clientForm", () => {
  it("사업자등록번호: 숫자만 남기고 3-2-5 자리로 하이픈", () => {
    expect(["", "12", "1234", "12345", "123456", "1234567890", "123-45-678901", "12a3 45"].map(formatBizRegNo)).toEqual([
      "",
      "12",
      "123-4",
      "123-45",
      "123-45-6",
      "123-45-67890",
      "123-45-67890", // 10자리까지만
      "123-45",
    ]);
  });

  it("이름 비교: 띄어쓰기·법인 형태·대소문자 무시", () => {
    expect(normalizeClientName("(주) 벤치 Tech")).toBe(normalizeClientName("벤치tech 주식회사"));
    expect(normalizeClientName("(유)한빛")).toBe("한빛");
    expect(normalizeClientName("한빛상사")).not.toBe(normalizeClientName("한빛"));
  });

  it("저장된 거래처 → 입력란 값", () => {
    const client = {
      name: "벤치",
      biz_reg_no: "1234567890",
      ceo_name: null,
      biz_type: "제조",
      biz_class: null,
      phone: null,
      email: null,
      bank_name: null,
      bank_account: null,
      address: null,
      receivable_amount: 1500,
      payable_amount: 0,
      memo: null,
      contacts: [{ name: "김담당", title: null, landline_phone: null, mobile_phone: "010", email: null, memo: null }],
    } as unknown as Client;
    const v = toFormValues(client);
    expect(v.biz_reg_no).toBe("123-45-67890");
    expect([v.ceo_name, v.receivable_amount, v.payable_amount]).toEqual(["", "1500", "0"]);
    expect(v.contacts).toEqual([{ name: "김담당", title: "", landline_phone: "", mobile_phone: "010", email: "", memo: "" }]);
  });

  it("입력란 값 → API: 빈 칸은 null, 금액은 숫자, 이름 없는 담당자는 뺀다", () => {
    const payload = toPayload({
      ...EMPTY_CLIENT_FORM,
      name: "  벤치 ",
      email: " ",
      receivable_amount: "1200",
      payable_amount: "",
      contacts: [
        { name: " 김담당 ", title: "", landline_phone: "02 ", mobile_phone: "", email: "", memo: "" },
        { name: "  ", title: "과장", landline_phone: "", mobile_phone: "", email: "", memo: "" },
      ],
    }) as Record<string, unknown>;
    expect([payload.name, payload.email, payload.receivable_amount, payload.payable_amount]).toEqual(["벤치", null, 1200, 0]);
    expect(payload.contacts).toEqual([
      { name: "김담당", title: null, landline_phone: "02", mobile_phone: null, email: null, memo: null },
    ]);
  });

  it("사업자등록증 인식 결과: 값이 있는 항목만, 사업자번호는 형식 맞춤", () => {
    const r = { name: "벤치", biz_reg_no: "1234567890", ceo_name: null, address: "", biz_type: "제조", biz_class: null } as BusinessRegOcrResult;
    expect(bizRegOcrUpdates(r)).toEqual([
      ["name", "벤치"],
      ["biz_reg_no", "123-45-67890"],
      ["biz_type", "제조"],
    ]);
  });
});
