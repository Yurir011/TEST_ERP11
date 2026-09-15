const TOKEN_KEY = "erp_access_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export type UserRole = "admin" | "employee" | "site_admin";

// 대표(admin)와 사이트 관리자(site_admin) 모두 관리자 권한이 필요한 화면(공지사항 작성/일정 전체 관리 등)에 접근할 수 있다.
export function isAdminRole(role: UserRole | undefined): boolean {
  return role === "admin" || role === "site_admin";
}
export type JobGrade = "staff" | "assistant_manager" | "manager" | "director" | "chief";
export type JobTitle = "ceo" | "team_lead";

export const GRADE_LABELS: Record<JobGrade, string> = {
  staff: "사원",
  assistant_manager: "대리",
  manager: "과장",
  director: "이사",
  chief: "소장",
};

// 관리자가 직원별로 개별 열람 권한을 부여할 수 있는 메뉴 키. 대표(admin)/사이트 관리자는 이 값과 무관하게 항상 전체 접근 가능.
export type MenuPermissionKey = "projects" | "clients" | "transactions" | "payments" | "notices";

export const MENU_PERMISSION_OPTIONS: { value: MenuPermissionKey; label: string }[] = [
  { value: "projects", label: "프로젝트관리" },
  { value: "clients", label: "거래처관리" },
  { value: "transactions", label: "매입매출관리" },
  { value: "payments", label: "입출금관리" },
  { value: "notices", label: "공지사항" },
];

export interface CurrentUser {
  id: number;
  employee_no: string;
  email: string;
  name: string;
  role: UserRole;
  grade: JobGrade;
  title: JobTitle | null;
  hire_date: string;
  birth_date: string | null;
  address: string | null;
  is_active: boolean;
  menu_permissions: MenuPermissionKey[];
}

export function hasMenuPermission(user: CurrentUser | null | undefined, menu: MenuPermissionKey): boolean {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  return user.menu_permissions?.includes(menu) ?? false;
}
