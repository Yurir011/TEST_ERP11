import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { MENU_PERMISSION_OPTIONS, type CurrentUser, type JobGrade, type JobTitle, type MenuPermissionKey } from "../../lib/auth";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { logError } from "../../lib/logger";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const GRADE_OPTIONS: { value: JobGrade; label: string }[] = [
  { value: "staff", label: "사원" },
  { value: "assistant_manager", label: "대리" },
  { value: "manager", label: "과장" },
  { value: "director", label: "이사" },
  { value: "chief", label: "소장" },
];

const TITLE_OPTIONS: { value: JobTitle | null; label: string }[] = [
  { value: null, label: "없음" },
  { value: "team_lead", label: "팀장" },
  { value: "ceo", label: "대표" },
];

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [employeeNo, setEmployeeNo] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState<JobGrade>("staff");
  const [title, setTitle] = useState<JobTitle | null>(null);
  const [hireDate, setHireDate] = useState(todayISO());
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [menuPermissions, setMenuPermissions] = useState<MenuPermissionKey[]>([]);

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
        setGrade(found.grade);
        setTitle(found.title);
        setHireDate(found.hire_date);
        setBirthDate(found.birth_date ?? "");
        setAddress(found.address ?? "");
        setMenuPermissions(found.menu_permissions ?? []);
      })
      .catch((err) => {
        logError("UserForm", "조회 실패", err);
        setError("직원 정보를 불러오지 못했습니다.");
      })
      .finally(() => setIsLoading(false));
  }, [id, isEdit]);

  function toggleMenuPermission(key: MenuPermissionKey) {
    setMenuPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit) {
        await apiPut(`/api/users/${id}`, {
          name,
          grade,
          title,
          hire_date: hireDate,
          birth_date: birthDate || null,
          address: address.trim() || null,
          menu_permissions: menuPermissions,
        });
      } else {
        await apiPost("/api/users", {
          employee_no: employeeNo,
          email,
          name,
          password,
          grade,
          title,
          hire_date: hireDate,
          birth_date: birthDate || null,
          address: address.trim() || null,
          menu_permissions: menuPermissions,
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
              <label className="block text-xs text-text-muted mb-1.5">직급</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as JobGrade)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              >
                {GRADE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">생년월일</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">주소</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">직책</label>
            <div className="flex gap-2">
              {TITLE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTitle(opt.value)}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    title === opt.value
                      ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                      : "border-border text-text-muted hover:bg-bg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              대표로 지정하면 관리자 권한이, 그 외에는 일반직원 권한이 자동으로 부여됩니다.
            </p>
          </div>

          {title !== "ceo" && (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">메뉴 열람 권한</label>
              <div className="grid grid-cols-2 gap-2">
                {MENU_PERMISSION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer hover:bg-bg"
                  >
                    <input
                      type="checkbox"
                      checked={menuPermissions.includes(opt.value)}
                      onChange={() => toggleMenuPermission(opt.value)}
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-1.5">
                체크한 메뉴만 사이드바에 표시되며 해당 화면에 접근할 수 있습니다. 기본값은 전부 비활성화입니다.
              </p>
            </div>
          )}

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
