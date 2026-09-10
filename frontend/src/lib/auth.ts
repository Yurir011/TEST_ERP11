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

export type UserRole = "admin" | "employee";

export interface CurrentUser {
  id: number;
  employee_no: string;
  email: string;
  name: string;
  role: UserRole;
  department: string | null;
  hire_date: string;
  is_active: boolean;
}
