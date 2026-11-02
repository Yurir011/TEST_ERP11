import { History, KeyRound, Monitor, Pencil, Plus, Search, UserX, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/useAuth";
import { MENU_PERMISSION_OPTIONS, isAdminRole, type CurrentUser, type JobGrade, type JobTitle } from "../../lib/auth";
import { apiGet, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { SOFT_BADGE } from "../../components/ui/softBadge";

const GRADE_LABELS: Record<JobGrade, string> = {
  staff: "사원",
  assistant_manager: "대리",
  manager: "과장",
  director: "이사",
  chief: "소장",
};

const TITLE_LABELS: Record<JobTitle, string> = {
  ceo: "대표",
  team_lead: "팀장",
  dept_head: "부서장",
};

const AVATAR_COLORS = [
  "from-blue-500 to-blue-700",
  "from-emerald-400 to-emerald-600",
  "from-orange-400 to-orange-600",
  "from-violet-400 to-violet-700",
  "from-pink-400 to-pink-700",
];

function Avatar({ user, size }: { user: CurrentUser; size: "sm" | "xl" }) {
  const sizeCls = size === "xl" ? "w-[60px] h-[60px] text-[22px]" : "w-[30px] h-[30px] text-xs";
  return (
    <span
      className={`shrink-0 inline-grid place-items-center rounded-full font-bold text-white bg-gradient-to-br ${AVATAR_COLORS[user.id % AVATAR_COLORS.length]} ${sizeCls}`}
    >
      {user.name.charAt(0)}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-border last:border-0 text-sm">
      <span className="w-[70px] shrink-0 text-xs text-text-muted pt-0.5">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function permissionText(user: CurrentUser): string {
  if (isAdminRole(user.role)) return "전체 메뉴 접근 가능 (관리자)";
  const labels = MENU_PERMISSION_OPTIONS.filter((opt) => user.menu_permissions.includes(opt.value)).map((opt) => opt.label);
  return labels.length > 0 ? labels.join(", ") : "부여된 권한 없음";
}

export function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<CurrentUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  function loadUsers() {
    logDebug("Users", "직원 목록 조회");
    apiGet<CurrentUser[]>("/api/users")
      .then(setUsers)
      .catch((err) => {
        logError("Users", "목록 조회 실패", err);
        setError("직원 목록을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleToggleActive(user: CurrentUser) {
    setActionError(null);
    try {
      await apiPut(`/api/users/${user.id}/${user.is_active ? "deactivate" : "activate"}`);
      loadUsers();
    } catch (err) {
      logError("Users", "상태 변경 실패", err);
      setActionError("상태 변경 중 오류가 발생했습니다. (본인 계정은 비활성화할 수 없습니다)");
    }
  }

  async function handleResetPassword(userId: number) {
    if (newPassword.length < 4) {
      setActionError("비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    setActionError(null);
    try {
      await apiPut(`/api/users/${userId}/reset-password`, { new_password: newPassword });
      setResetTargetId(null);
      setNewPassword("");
    } catch (err) {
      logError("Users", "비밀번호 초기화 실패", err);
      setActionError("비밀번호 초기화 중 오류가 발생했습니다.");
    }
  }

  const keyword = query.trim().toLowerCase();
  const listed = (users ?? []).filter(
    (u) => !keyword || [u.name, u.employee_no, u.email].some((v) => v.toLowerCase().includes(keyword))
  );
  const selected = (users ?? []).find((u) => u.id === selectedId) ?? listed[0] ?? null;

  return (
    <MainLayout
      title="설정 · 직원 계정 관리"
      description="사내 ERP를 사용할 직원 계정을 관리합니다."
      actions={
        <div className="flex items-center gap-2">
          {me?.role === "admin" && (
            <Link
              to="/settings/devices"
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface"
            >
              <Monitor size={14} />
              기기 관리
            </Link>
          )}
          {me?.role === "admin" && (
            // 변경 이력(감사 로그)은 대표만 볼 수 있다
            <Link
              to="/settings/audit-logs"
              className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-surface"
            >
              <History size={14} />
              변경 이력
            </Link>
          )}
          <Link
            to="/settings/users/new"
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            새 직원 등록
          </Link>
        </div>
      }
    >
      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {actionError && <p className="text-sm text-danger mb-4">{actionError}</p>}

      {users !== null && (
        <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-4 items-start">
          {/* 왼쪽: 직원 목록 */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <label className="m-2.5 flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-text-muted">
              <Search size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름·사번·이메일 검색"
                aria-label="직원 검색"
                className="w-full bg-transparent text-xs text-text outline-none"
              />
            </label>
            {listed.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  logDebug("Users", `직원 선택: id=${u.id}`);
                  setSelectedId(u.id);
                  setResetTargetId(null);
                  setActionError(null);
                }}
                className={`flex w-full items-center gap-2.5 border-l-[3px] px-3.5 py-2.5 text-left transition-colors ${
                  selected?.id === u.id ? "border-primary bg-tile-blue" : "border-transparent hover:bg-bg"
                } ${u.is_active ? "" : "opacity-60"}`}
              >
                <Avatar user={u} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{u.name}</span>
                  <span className="block text-xs text-text-muted">{GRADE_LABELS[u.grade]}</span>
                </span>
              </button>
            ))}
            {listed.length === 0 && <p className="px-4 py-6 text-center text-xs text-text-muted">조건에 맞는 직원이 없습니다.</p>}
          </div>

          {/* 오른쪽: 선택한 직원 상세 */}
          {selected && (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="h-14 bg-gradient-to-r from-[#3b82f6] to-[#7c3aed]" />
              <div className="-mt-[26px] px-[18px] flex flex-wrap items-start gap-3.5">
                <span className="rounded-full ring-4 ring-surface">
                  <Avatar user={selected} size="xl" />
                </span>
                {/* 이름은 커버 밖(카드 바탕) 위에 둔다 */}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 pt-8">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[23px] font-bold leading-tight">
                      {selected.name}
                      <span className={`text-xs px-2 py-1 font-medium ${selected.is_active ? SOFT_BADGE.green : SOFT_BADGE.red}`}>
                        {selected.is_active ? "재직" : "비활성"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-text-muted">
                      {GRADE_LABELS[selected.grade]}
                      {selected.title ? ` · ${TITLE_LABELS[selected.title]}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      to={`/settings/users/${selected.id}/edit`}
                      className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-bg whitespace-nowrap"
                    >
                      <Pencil size={12} />
                      수정
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setResetTargetId(resetTargetId === selected.id ? null : selected.id);
                        setNewPassword("");
                        setActionError(null);
                      }}
                      className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-bg whitespace-nowrap"
                    >
                      <KeyRound size={12} />
                      비밀번호 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(selected)}
                      className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 whitespace-nowrap ${
                        selected.is_active ? "text-danger border-danger/30 hover:bg-red-50" : "text-success border-success/30 hover:bg-tile-green"
                      }`}
                    >
                      {selected.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                      {selected.is_active ? "비활성화" : "활성화"}
                    </button>
                  </div>
                </div>
              </div>

              {resetTargetId === selected.id && (
                <div className="mx-[18px] mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="새 비밀번호 (4자 이상)"
                    aria-label="새 비밀번호"
                    className="text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary bg-bg w-48"
                  />
                  <button onClick={() => handleResetPassword(selected.id)} className="text-xs bg-primary text-white rounded-lg px-3 py-1.5">
                    변경
                  </button>
                </div>
              )}

              <div className="px-[18px] pt-7 pb-2.5">
                <InfoRow label="사번" value={selected.employee_no} />
                <InfoRow label="이메일" value={selected.email} />
                <InfoRow label="입사일" value={selected.hire_date} />
                <InfoRow label="생년월일" value={selected.birth_date ?? "-"} />
                <InfoRow label="주소" value={selected.address ?? "-"} />
                <InfoRow label="메뉴 권한" value={permissionText(selected)} />
              </div>
            </div>
          )}
        </div>
      )}
    </MainLayout>
  );
}
