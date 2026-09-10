export interface Client {
  id: number;
  name: string;
  biz_reg_no: string | null;
  ceo_name: string | null;
  business_type: string | null;
  phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  bank_name: string | null;
  bank_account: string | null;
  address: string | null;
  receivable_amount: number;
  payable_amount: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientFormValues {
  name: string;
  biz_reg_no: string;
  ceo_name: string;
  business_type: string;
  phone: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  bank_name: string;
  bank_account: string;
  address: string;
  receivable_amount: string;
  payable_amount: string;
  memo: string;
}

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  name: "",
  biz_reg_no: "",
  ceo_name: "",
  business_type: "",
  phone: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  bank_name: "",
  bank_account: "",
  address: "",
  receivable_amount: "0",
  payable_amount: "0",
  memo: "",
};
