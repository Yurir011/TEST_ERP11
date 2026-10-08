export interface ClientContact {
  id: number;
  name: string;
  title: string | null;
  landline_phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  memo: string | null;
}

export interface Client {
  id: number;
  name: string;
  biz_reg_no: string | null;
  ceo_name: string | null;
  biz_type: string | null;
  biz_class: string | null;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  bank_account: string | null;
  address: string | null;
  receivable_amount: number;
  payable_amount: number;
  memo: string | null;
  has_biz_reg_image: boolean;
  has_biz_reg_image2: boolean;
  has_bankbook_image: boolean;
  contacts: ClientContact[];
  created_at: string;
  updated_at: string;
}

export interface BankbookOcrResult {
  bank_name: string | null;
  bank_account: string | null;
  holder: string | null; // 예금주 (거래처명과 비교하는 참고용)
  raw_text: string;
}

export interface BusinessRegOcrResult {
  name: string | null;
  biz_reg_no: string | null;
  ceo_name: string | null;
  address: string | null;
  biz_type: string | null;
  biz_class: string | null;
  raw_text: string;
}

export interface ClientContactFormValues {
  name: string;
  title: string;
  landline_phone: string;
  mobile_phone: string;
  email: string;
  memo: string;
}

export const EMPTY_CLIENT_CONTACT: ClientContactFormValues = {
  name: "",
  title: "",
  landline_phone: "",
  mobile_phone: "",
  email: "",
  memo: "",
};

export interface ClientFormValues {
  name: string;
  biz_reg_no: string;
  ceo_name: string;
  biz_type: string;
  biz_class: string;
  phone: string;
  email: string;
  bank_name: string;
  bank_account: string;
  address: string;
  receivable_amount: string;
  payable_amount: string;
  memo: string;
  contacts: ClientContactFormValues[];
}

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  name: "",
  biz_reg_no: "",
  ceo_name: "",
  biz_type: "",
  biz_class: "",
  phone: "",
  email: "",
  bank_name: "",
  bank_account: "",
  address: "",
  receivable_amount: "0",
  payable_amount: "0",
  memo: "",
  contacts: [],
};
