import { Fingerprint, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiDelete, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { PasskeyInfo } from "../../lib/passkey";

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "-";
}

/** 직원 수정 화면의 "패스키" 칸 (관리자): 직원이 등록한 지문·얼굴 로그인 기기를 보고, 분실 신고가 오면 삭제한다. */
export function PasskeysSection({ userId, userName }: { userId: number; userName: string }) {
  const dialog = useDialog();
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    logDebug("Passkeys", `패스키 목록 조회: user_id=${userId}`);
    apiGet<PasskeyInfo[]>(`/api/passkeys/admin/${userId}`)
      .then(setPasskeys)
      .catch((err) => {
        logError("Passkeys", "패스키 목록 조회 실패", err);
        setError("패스키 목록을 불러오지 못했습니다.");
      });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(p: PasskeyInfo) {
    if (!(await dialog.confirm(`${userName}님의 "${p.name}" 패스키를 삭제할까요?\n그 기기로는 더 이상 지문·얼굴 로그인을 할 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/passkeys/admin/${userId}/${p.id}`);
      load();
    } catch (err) {
      logError("Passkeys", "패스키 삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
        <Fingerprint size={16} aria-hidden />
        패스키 (지문·얼굴 로그인)
      </h2>
      <p className="text-xs text-text-muted mb-3">직원이 폰에서 직접 등록합니다. 폰을 잃어버렸다는 연락을 받으면 해당 기기를 삭제하세요.</p>
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      <div className="bg-surface border border-border rounded-2xl">
        {passkeys === null ? (
          <p className="p-4 text-sm text-text-muted">불러오는 중...</p>
        ) : passkeys.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">등록된 패스키가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-text-muted tabular-nums">
                    {formatDate(p.created_at)} 등록 · 마지막 사용 {formatDate(p.last_used_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  aria-label={`${p.name} 삭제`}
                  className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-red-50"
                >
                  <Trash2 size={14} aria-hidden />
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
