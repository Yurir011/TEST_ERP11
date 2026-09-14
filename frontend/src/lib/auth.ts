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

export interface CurrentUser {
  id: number;
  employee_no: string;
  email: string;
  name: string;
  role: UserRole;
  grade: JobGrade;
  title: JobTitle | null;
  hire_date: string;
  is_active: boolean;
}
