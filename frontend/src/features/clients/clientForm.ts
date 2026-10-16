import type { BusinessRegOcrResult, Client, ClientFormValues } from "./types";

// 거래처 등록/수정 화면(ClientFormPage)의 순수 상수·변환 함수 (화면 상태와 분리).

export const NUMBER_FIELDS = new Set<keyof ClientFormValues>(["receivable_amount", "payable_amount"]);

// 사업자등록번호는 어디든 3자리-2자리-5자리 형식이므로, 숫자만 남긴 뒤 하이픈을 자동으로 붙여준다.
export function formatBizRegNo(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export const FIELDS_TOP: { key: keyof ClientFormValues; label: string; required?: boolean }[] = [
  { key: "name", label: "상호", required: true },
  { key: "biz_reg_no", label: "사업자등록번호" },
  { key: "ceo_name", label: "대표자명" },
  { key: "phone", label: "전화번호(유선)" },
  { key: "biz_type", label: "업태" },
  { key: "biz_class", label: "종목" },
  { key: "email", label: "이메일" },
];

export const FIELDS_BOTTOM: { key: keyof ClientFormValues; label: string; span2?: boolean }[] = [
  { key: "address", label: "주소", span2: true },
  { key: "receivable_amount", label: "미수금 (원)" },
  { key: "payable_amount", label: "미지급금 (원)" },
];

export function toFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    biz_reg_no: formatBizRegNo(client.biz_reg_no ?? ""),
    ceo_name: client.ceo_name ?? "",
    biz_type: client.biz_type ?? "",
    biz_class: client.biz_class ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    bank_name: client.bank_name ?? "",
    bank_account: client.bank_account ?? "",
    address: client.address ?? "",
    receivable_amount: String(client.receivable_amount),
    payable_amount: String(client.payable_amount),
    memo: client.memo ?? "",
    contacts: client.contacts.map((c) => ({
      name: c.name,
      title: c.title ?? "",
      landline_phone: c.landline_phone ?? "",
      mobile_phone: c.mobile_phone ?? "",
      email: c.email ?? "",
      memo: c.memo ?? "",
    })),
  };
}

export function toPayload(values: ClientFormValues) {
  const entries = Object.entries(values)
    .filter(([k]) => k !== "contacts")
    .map(([k, v]) => {
      const key = k as keyof ClientFormValues;
      if (NUMBER_FIELDS.has(key)) {
        return [k, Number(v) || 0];
      }
      return [k, (v as string).trim() === "" ? null : (v as string).trim()];
    });

  const contacts = values.contacts
    .filter((c) => c.name.trim() !== "")
    .map((c) => ({
      name: c.name.trim(),
      title: c.title.trim() === "" ? null : c.title.trim(),
      landline_phone: c.landline_phone.trim() === "" ? null : c.landline_phone.trim(),
      mobile_phone: c.mobile_phone.trim() === "" ? null : c.mobile_phone.trim(),
      email: c.email.trim() === "" ? null : c.email.trim(),
      memo: c.memo.trim() === "" ? null : c.memo.trim(),
    }));

  return { ...Object.fromEntries(entries), contacts };
}

/** 같은 이름 비교용: 띄어쓰기/법인 형태(주식회사, (주))가 달라도 같은 이름으로 본다. */
export function normalizeClientName(name: string): string {
  return name.replace(/\s|\(주\)|\(유\)|주식회사|유한회사/g, "").toLowerCase();
}

/** 사업자등록증 인식 결과 중 값이 있는 항목 → 입력란에 채울 (항목, 값) 목록 */
export function bizRegOcrUpdates(result: BusinessRegOcrResult): [keyof ClientFormValues, string | null][] {
  const updates: [keyof ClientFormValues, string | null][] = [
    ["name", result.name],
    ["biz_reg_no", result.biz_reg_no ? formatBizRegNo(result.biz_reg_no) : null],
    ["ceo_name", result.ceo_name],
    ["address", result.address],
    ["biz_type", result.biz_type],
    ["biz_class", result.biz_class],
  ];
  return updates.filter(([, v]) => v);
}
