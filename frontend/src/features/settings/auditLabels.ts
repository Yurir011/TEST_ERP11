// 감사 로그(변경 이력) 화면의 표시용 라벨과 값 변환 (화면과 분리한 순수 함수).

export interface AuditLogEntry {
  id: number;
  created_at: string;
  user_id: number | null;
  user_name: string | null;
  ip: string | null;
  request: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  changes: Record<string, [unknown, unknown]> | null;
  summary: string | null;
}

export const ACTION_LABELS: Record<string, { label: string; tone: "green" | "blue" | "red" | "gray" | "orange" }> = {
  create: { label: "등록", tone: "green" },
  update: { label: "수정", tone: "blue" },
  delete: { label: "삭제", tone: "red" },
  login_success: { label: "로그인", tone: "gray" },
  login_failed: { label: "로그인 실패", tone: "orange" },
  login_blocked: { label: "로그인 차단", tone: "orange" },
  nfc_card_registered: { label: "카드 등록", tone: "green" },
  nfc_card_deactivated: { label: "카드 중지", tone: "orange" },
  nfc_card_deleted: { label: "카드 삭제", tone: "red" },
  device_registered: { label: "기기 등록 요청", tone: "gray" },
  device_approved: { label: "기기 승인", tone: "green" },
  device_revoked: { label: "기기 중지", tone: "orange" },
  device_deleted: { label: "기기 요청 거절", tone: "red" },
};

export const ENTITY_LABELS: Record<string, string> = {
  client: "거래처",
  payment: "입출금",
  transaction: "매입매출",
  user: "직원 계정",
  project_document: "문서",
  proposal: "품의서",
  nfc_card: "NFC 카드",
  device: "기기",
};

/** 대상 필터 선택지 → API entity_type 값 (문서는 프로젝트 문서와 품의서를 함께 본다) */
export const ENTITY_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "client", label: "거래처" },
  { value: "payment", label: "입출금" },
  { value: "transaction", label: "매입매출" },
  { value: "user", label: "직원 계정" },
  { value: "project_document,proposal", label: "문서" },
  { value: "nfc_card,device", label: "카드·기기" },
];

export const FIELD_LABELS: Record<string, string> = {
  receivable_amount: "미수금",
  payable_amount: "미지급금",
  name: "이름",
  biz_reg_no: "사업자번호",
  ceo_name: "대표자",
  phone: "전화",
  email: "이메일",
  bank_name: "은행",
  bank_account: "계좌번호",
  address: "주소",
  type: "구분",
  transaction_date: "거래일",
  payment_date: "날짜",
  client_id: "거래처 번호",
  counterparty: "거래처명",
  item_name: "품목",
  supply_amount: "공급가액",
  vat_amount: "부가세",
  total_amount: "합계",
  tax_invoice_no: "계산서 번호",
  memo: "메모",
  settled: "결제완료",
  settled_date: "결제일",
  settled_payment_id: "결제 입출금 번호",
  paid_amount: "받은(준) 금액",
  category: "분류",
  description: "내용",
  amount: "금액",
  method: "결제수단",
  card_type: "카드",
  bank_type: "계좌",
  card_pending: "카드 결제예정",
  proof_type: "증빙",
  partial_transaction_id: "부분 결제 매입매출 번호",
  employee_no: "사번",
  role: "역할",
  grade: "직급",
  title: "직책",
  is_active: "사용 여부",
  menu_permissions: "메뉴 권한",
  hashed_password: "비밀번호",
  status: "상태",
  delete_requested: "삭제 요청",
  popbill_issued_at: "팝빌 발행",
  reject_reason: "반려 사유",
};

const VALUE_LABELS: Record<string, string> = {
  deposit: "입금",
  withdrawal: "출금",
  sales: "매출",
  purchase: "매입",
  pending: "결재 대기",
  approved: "승인",
  rejected: "반려",
  draft: "작성 중",
  admin: "대표",
  employee: "일반직원",
  site_admin: "사이트 관리자",
  bank_transfer: "계좌이체",
  corporate_card: "법인카드",
  cash: "현금",
  other: "기타",
  projects: "프로젝트",
  clients: "거래처",
  transactions: "매입매출",
  payments: "입출금",
  notices: "업무 알림",
  tax_invoice: "세금계산서",
};

/** 변경 전/후 값을 사람이 읽는 문자열로 */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  if (Array.isArray(value)) return value.length ? value.map((v) => formatAuditValue(v)).join(", ") : "(없음)";
  const text = String(value);
  return VALUE_LABELS[text] ?? text;
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function targetLabel(entry: Pick<AuditLogEntry, "entity_type" | "entity_id" | "action">): string {
  if (entry.action.startsWith("login_")) return "로그인";
  const name = ENTITY_LABELS[entry.entity_type] ?? entry.entity_type;
  return entry.entity_id !== null ? `${name} #${entry.entity_id}` : name;
}
