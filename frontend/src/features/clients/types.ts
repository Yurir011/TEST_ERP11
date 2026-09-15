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
  business_type: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_account: string | null;
  address: string | null;
  receivable_amount: number;
  payable_amount: number;
  memo: string | null;
  contacts: ClientContact[];
  created_at: string;
  updated_at: string;
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
  business_type: string;
  phone: string;
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
  business_type: "",
  phone: "",
  bank_name: "",
  bank_account: "",
  address: "",
  receivable_amount: "0",
  payable_amount: "0",
  memo: "",
  contacts: [],
};
