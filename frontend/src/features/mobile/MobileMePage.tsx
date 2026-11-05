import { Fingerprint, LogOut, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ApiError, apiDelete, apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { defaultPasskeyName, fetchPasskeyEnabled, passkeyErrorMessage, passkeySupported, registerPasskey, type PasskeyInfo } from "../../lib/passkey";
import { MobileCard, MobileLayout } from "./MobileLayout";

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "-";
}

/** 내 정보: 이 폰에 지문·얼굴 로그인(패스키)을 등록·삭제하고 로그아웃한다. */
export function MobileMePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { confirm, notify } = useDialog();
  const supported = passkeySupported();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null);
  const [name, setName] = useState(() => defaultPasskeyName(typeof navigator === "undefined" ? "" : navigator.userAgent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<PasskeyInfo[]>("/api/passkeys")
      .then(setPasskeys)
      .catch((err) => {
        logError("MobileMe", "패스키 목록 조회 실패", err);
        setPasskeys([]);
      });
  }, []);

  useEffect(() => {
    void fetchPasskeyEnabled().then(setEnabled);
    load();
  }, [load]);

  async function handleAdd() {
    if (!name.trim()) {
      setError("기기 이름을 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      logDebug("MobileMe", `패스키 등록 시도: name=${name.trim()}`);
      await registerPasskey(name.trim());
      notify("이 기기에 패스키를 등록했습니다. 다음부터 지문·얼굴로 로그인할 수 있어요.");
      load();
    } catch (err) {
      logError("MobileMe", "패스키 등록 실패", err);
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p: PasskeyInfo) {
    if (!(await confirm(`"${p.name}" 패스키를 삭제할까요?\n삭제하면 그 기기에서는 지문·얼굴로 로그인할 수 없습니다.`, { okLabel: "삭제", danger: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/passkeys/${p.id}`);
      load();
    } catch (err) {
      logError("MobileMe", "패스키 삭제 실패", err);
      setError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  return (
    <MobileLayout title="내 정보">
      <MobileCard>
        <p className="text-base font-bold">{user?.name}</p>
        <p className="text-xs text-text-muted mt-0.5 break-all">
          사번 {user?.employee_no} · {user?.email}
        </p>
      </MobileCard>

      <h2 className="text-sm font-semibold px-1">지문·얼굴 로그인 (패스키)</h2>
      <MobileCard className="space-y-3">
        {enabled === false && <p className="text-xs text-text-muted">패스키 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.</p>}
        {enabled && !supported && (
          <p className="text-xs text-text-muted">이 화면에서는 패스키를 쓸 수 없습니다. 보안 연결(HTTPS)로 접속한 폰 브라우저에서 등록해주세요.</p>
        )}

        {passkeys === null ? (
          <p className="text-xs text-text-muted">불러오는 중...</p>
        ) : passkeys.length === 0 ? (
          <p className="text-xs text-text-muted">등록된 패스키가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="w-9 h-9 rounded-xl bg-tile-blue text-tile-blue-fg flex items-center justify-center shrink-0">
                  <Fingerprint size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{p.name}</p>
                  <p className="text-[11px] text-text-muted tabular-nums">
                    {formatDate(p.created_at)} 등록 · 마지막 사용 {formatDate(p.last_used_at)}
                  </p>
                </div>
                <button type="button" onClick={() => handleDelete(p)} aria-label={`${p.name} 삭제`} className="p-2 text-text-muted">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {enabled && supported && (
          <div className="space-y-2 pt-1">
            <label className="block text-xs text-text-muted" htmlFor="passkey-name">
              이 기기 이름
            </label>
            <input
              id="passkey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-base outline-none focus:border-primary bg-bg"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              className="w-full flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
            >
              <Plus size={16} aria-hidden />
              {busy ? "확인 중..." : "이 폰에 패스키 추가"}
            </button>
          </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </MobileCard>
      <p className="text-xs bg-tile-blue text-tile-blue-fg rounded-xl px-3 py-2">폰을 바꾸거나 잃어버리면 여기서 삭제하세요. 관리자도 직원의 패스키를 지울 수 있습니다.</p>

      <button
        type="button"
        onClick={() => {
          logout();
          navigate("/login", { replace: true });
        }}
        className="w-full flex items-center justify-center gap-1.5 border border-border rounded-xl py-3 text-sm font-medium"
      >
        <LogOut size={16} aria-hidden />
        로그아웃
      </button>
    </MobileLayout>
  );
}
