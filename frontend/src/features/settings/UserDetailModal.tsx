import { X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  GRADE_LABELS,
  MENU_PERMISSION_OPTIONS,
  isAdminRole,
  type CurrentUser,
  type JobTitle,
} from "../../lib/auth";

const TITLE_LABELS: Record<JobTitle, string> = {
  ceo: "대표",
  team_lead: "팀장",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      <span className="text-sm text-right break-words">{value}</span>
    </div>
  );
}

export function UserDetailModal({ user, onClose }: { user: CurrentUser; onClose: () => void }) {
  const permissionText = isAdminRole(user.role)
    ? "전체 메뉴 접근 가능 (관리자)"
    : user.menu_permissions.length > 0
      ? MENU_PERMISSION_OPTIONS.filter((opt) => user.menu_permissions.includes(opt.value))
          .map((opt) => opt.label)
          .join(", ")
      : "부여된 권한 없음";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                user.is_active ? "bg-tile-green text-tile-green-fg" : "bg-red-50 text-danger"
              }`}
            >
              {user.is_active ? "활성" : "비활성"}
            </span>
            <h3 className="text-sm font-semibold mt-2">
              {user.name} · {user.employee_no}
            </h3>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text shrink-0">
            <X size={18} />
          </button>
        </div>

        <div>
          <Row label="이메일" value={user.email} />
          <Row label="직급" value={GRADE_LABELS[user.grade]} />
          <Row label="직책" value={user.title ? TITLE_LABELS[user.title] : "-"} />
          <Row label="입사일" value={user.hire_date} />
          <Row label="생년월일" value={user.birth_date ?? "-"} />
          <Row label="주소" value={user.address ?? "-"} />
          <Row label="메뉴 열람 권한" value={permissionText} />
        </div>

        <div className="flex items-center gap-2 mt-5">
          <Link
            to={`/settings/users/${user.id}/edit`}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg"
          >
            수정
          </Link>
          <button onClick={onClose} className="ml-auto text-xs text-text-muted hover:text-text px-3 py-2">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
