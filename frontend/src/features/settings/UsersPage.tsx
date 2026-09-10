import { KeyRound, Plus, UserX, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import type { CurrentUser } from "../../lib/auth";
import { apiGet, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";

const ROLE_LABELS = { admin: "관리자", employee: "일반직원" } as const;

export function UsersPage() {
  const [users, setUsers] = useState<CurrentUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

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

  return (
    <MainLayout
      title="설정 · 직원 계정 관리"
      description="사내 ERP를 사용할 직원 계정을 관리합니다."
      actions={
        <Link
          to="/settings/users/new"
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          새 직원 등록
        </Link>
      }
    >
      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {actionError && <p className="text-sm text-danger mb-4">{actionError}</p>}

      {users !== null && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2.5 px-4 font-medium">사번</th>
                <th className="py-2.5 px-4 font-medium">이름</th>
                <th className="py-2.5 px-4 font-medium">이메일</th>
                <th className="py-2.5 px-4 font-medium">부서</th>
                <th className="py-2.5 px-4 font-medium">역할</th>
                <th className="py-2.5 px-4 font-medium">상태</th>
                <th className="py-2.5 px-4 font-medium w-64"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-4">{u.employee_no}</td>
                  <td className="py-2.5 px-4 font-medium">{u.name}</td>
                  <td className="py-2.5 px-4 text-text-muted">{u.email}</td>
                  <td className="py-2.5 px-4">{u.department ?? "-"}</td>
                  <td className="py-2.5 px-4">{ROLE_LABELS[u.role]}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        u.is_active ? "bg-tile-green text-tile-green-fg" : "bg-red-50 text-danger"
                      }`}
                    >
                      {u.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        to={`/settings/users/${u.id}/edit`}
                        className="text-xs text-text-muted hover:text-text border border-border rounded-lg px-2.5 py-1.5"
                      >
                        수정
                      </Link>
                      <button
                        onClick={() => {
                          setResetTargetId(resetTargetId === u.id ? null : u.id);
                          setNewPassword("");
                          setActionError(null);
                        }}
                        className="flex items-center gap-1 text-xs text-text-muted hover:text-text border border-border rounded-lg px-2.5 py-1.5"
                      >
                        <KeyRound size={12} />
                        비밀번호
                      </button>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`flex items-center gap-1 text-xs border rounded-lg px-2.5 py-1.5 ${
                          u.is_active
                            ? "text-danger border-danger/30 hover:bg-red-50"
                            : "text-success border-success/30 hover:bg-tile-green"
                        }`}
                      >
                        {u.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                        {u.is_active ? "비활성화" : "활성화"}
                      </button>
                    </div>
                    {resetTargetId === u.id && (
                      <div className="flex items-center gap-2 mt-2 justify-end">
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="새 비밀번호"
                          className="text-xs border border-border rounded-lg px-2 py-1 outline-none focus:border-primary bg-bg w-32"
                        />
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="text-xs bg-primary text-white rounded-lg px-2.5 py-1"
                        >
                          변경
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MainLayout>
  );
}
