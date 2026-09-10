import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { CurrentUser, UserRole } from "../../lib/auth";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { logError } from "../../lib/logger";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [employeeNo, setEmployeeNo] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("employee");
  const [department, setDepartment] = useState("");
  const [hireDate, setHireDate] = useState(todayISO());

  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    apiGet<CurrentUser[]>("/api/users")
      .then((list) => {
        const found = list.find((u) => u.id === Number(id));
        if (!found) {
          setError("직원을 찾을 수 없습니다.");
          return;
        }
        setEmployeeNo(found.employee_no);
        setEmail(found.email);
        setName(found.name);
        setRole(found.role);
        setDepartment(found.department ?? "");
        setHireDate(found.hire_date);
      })
      .catch((err) => {
        logError("UserForm", "조회 실패", err);
        setError("직원 정보를 불러오지 못했습니다.");
      })
      .finally(() => setIsLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit) {
        await apiPut(`/api/users/${id}`, {
          name,
          department: department || null,
          hire_date: hireDate,
          role,
        });
      } else {
        await apiPost("/api/users", {
          employee_no: employeeNo,
          email,
          name,
          password,
          role,
          department: department || null,
          hire_date: hireDate,
        });
      }
      navigate("/settings", { replace: true });
    } catch (err) {
      logError("UserForm", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title={isEdit ? "직원 정보 수정" : "새 직원 등록"}>
      {isLoading ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">사번</label>
              <input
                required
                disabled={isEdit}
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">이메일 (로그인 ID)</label>
              <input
                required
                type="email"
                disabled={isEdit}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">이름</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">초기 비밀번호</label>
              <input
                required
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="4자 이상"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">부서</label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">입사일</label>
              <input
                type="date"
                required
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">역할</label>
            <div className="flex gap-2">
              {(["employee", "admin"] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    role === r
                      ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                      : "border-border text-text-muted hover:bg-bg"
                  }`}
                >
                  {r === "admin" ? "관리자" : "일반직원"}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </MainLayout>
  );
}
