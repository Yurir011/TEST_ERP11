export interface Contact {
  id: number;
  name: string;
  client_id: number | null;
  company: string | null; // 화면에 보이는 회사 이름
  title: string | null;
  phone: string | null;
  phone2: string | null; // 전화번호는 최대 2개
  email: string | null;
  memo: string | null;
  updated_at: string;
}

export interface ContactInput {
  name: string;
  client_id: number | null;
  company_name: string | null;
  title: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  memo: string | null;
}

export interface ClientOption {
  id: number;
  name: string;
}

export interface ClientSummary {
  id: number;
  name: string;
  ceo_name: string | null;
  biz_type: string | null;
  biz_class: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contacts: { name: string; title: string | null; landline_phone: string | null; mobile_phone: string | null; email: string | null }[];
}

/** 전화 걸기용 번호 (숫자와 +만) */
export const telHref = (n: string) => `tel:${n.replace(/[^0-9+]/g, "")}`;
