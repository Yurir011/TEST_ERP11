import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { ApiError, apiGet, downloadFile } from "../../lib/api";
import { formatVersion, isNewerVersion } from "../../lib/appVersion";
import { getBenchClient } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";

interface ClientRelease {
  version: string;
  display: string;
  filename: string;
  size: number;
  notes: string;
  published_at: string | null;
}

const DISMISS_KEY = "bench-update-dismissed";
/** 앱을 켜 둔 동안 새 버전을 다시 확인하는 간격 */
export const RECHECK_MS = 60 * 60_000;

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * 데스크톱 앱에서만 보이는 새 버전 안내.
 * - 바로 업데이트를 지원하는 앱: 서버에 올라온 최신 버전이 지금 앱보다 새 것이면 [지금 업데이트]를 보여 준다. 누르면 앱이 새 설치 파일을
 *   받아 검사하고 조용히 설치한 뒤 다시 시작한다(로그인은 유지). 앱을 켜 둔 동안 1시간마다 다시 확인한다.
 * - 예전 앱: 이전처럼 [다운로드]만 보여 주고, 내려받은 설치 파일은 직원이 직접 실행한다.
 * [나중에]를 누르면 이번 실행 동안 같은 버전은 다시 묻지 않는다.
 */
export function DesktopUpdateNotice() {
  const bench = getBenchClient();
  const dialog = useDialog();
  const [update, setUpdate] = useState<{ latest: ClientRelease; current: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const direct = typeof bench?.update?.install === "function";

  useEffect(() => {
    if (!bench) return;
    let cancelled = false;
    const found = (latest: ClientRelease, current: string) => {
      if (cancelled) return;
      logDebug("Update", `새 버전 안내: 현재 ${current} → ${latest.display}`);
      setUpdate({ latest, current });
      setDismissed(readDismissed() === latest.version);
    };
    const check = () => {
      if (bench.update) {
        bench.update
          .check()
          .then((r) => {
            if (r.ok && r.newer && r.latest) found({ ...r.latest, notes: "", published_at: null }, r.current);
          })
          .catch((err) => logError("Update", "최신 버전 확인 실패", err));
        return;
      }
      Promise.all([bench.getVersion(), apiGet<ClientRelease | null>("/api/client/latest")])
        .then(([current, latest]) => {
          if (latest && isNewerVersion(latest.version, current)) found(latest, current);
        })
        .catch((err) => logError("Update", "최신 버전 확인 실패", err)); // 확인하지 못해도 업무에는 영향이 없다
    };
    check();
    const timer = bench.update ? window.setInterval(check, RECHECK_MS) : null;
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [bench]);

  useEffect(() => {
    if (!bench?.update || !busy) return;
    return bench.update.onProgress(({ ratio: r }) => setRatio(r));
  }, [bench, busy]);

  if (!bench || !update || dismissed) return null;
  const { latest, current } = update;

  async function download() {
    setBusy(true);
    try {
      await downloadFile("/api/client/download", latest.filename);
      dialog.notify(`${latest.display} 설치 파일을 내려받았습니다. 설치하기 전에 이 앱을 종료(트레이 아이콘 우클릭 → 종료)한 뒤 파일을 실행하세요.`);
    } catch (err) {
      logError("Update", "설치 파일 다운로드 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "설치 파일을 내려받지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function installNow() {
    if (!bench?.update || busy) return;
    const ok = await dialog.confirm(`${latest.display} 로 업데이트합니다.\n새 버전을 받아 설치하는 동안 앱이 종료되었다가 자동으로 다시 시작됩니다(로그인은 유지됩니다).\n작성 중인 메일이나 입력 중인 내용이 있으면 먼저 저장하거나 보낸 뒤 진행하세요.`, { okLabel: "지금 업데이트" });
    if (!ok) return;
    setBusy(true);
    setRatio(0);
    logDebug("Update", `바로 업데이트 시작: ${latest.display}`);
    try {
      const r = await bench.update.install();
      if (!r.ok) {
        dialog.notifyError(r.error);
        setBusy(false);
        setRatio(null);
        return;
      }
      setInstalling(true); // 곧 앱이 종료된다
    } catch (err) {
      logError("Update", "바로 업데이트 실패", err);
      dialog.notifyError("업데이트하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      setBusy(false);
      setRatio(null);
    }
  }

  function later() {
    try {
      sessionStorage.setItem(DISMISS_KEY, latest.version);
    } catch {
      /* 저장할 수 없어도 이 화면에서는 닫힌다 */
    }
    setDismissed(true);
  }

  const percent = ratio === null ? null : Math.round(ratio * 100);
  return (
    <div role="status" aria-label="새 버전 안내" className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-tile-blue px-4 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <span className="font-medium">새 버전 {latest.display}이 있습니다</span>
        <span className="text-text-muted"> (현재 {formatVersion(current)})</span>
        {installing ? (
          <p className="text-xs text-text-muted">설치 중입니다. 앱이 곧 종료되었다가 다시 시작됩니다...</p>
        ) : percent !== null && busy ? (
          <p className="text-xs text-text-muted" aria-live="polite">
            새 버전을 받는 중... {percent}%
          </p>
        ) : (
          latest.notes && (
            <p className="text-xs text-text-muted truncate" title={latest.notes}>
              {latest.notes}
            </p>
          )
        )}
      </div>
      {direct ? (
        <button type="button" onClick={() => void installNow()} disabled={busy} className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:bg-primary-hover disabled:opacity-60">
          {installing ? "설치 중..." : busy ? "받는 중..." : "지금 업데이트"}
        </button>
      ) : (
        <button type="button" onClick={() => void download()} disabled={busy} className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:bg-primary-hover disabled:opacity-60">
          {busy ? "받는 중..." : "다운로드"}
        </button>
      )}
      {!busy && (
        <button type="button" onClick={later} aria-label="나중에" title="나중에" className="p-1 text-text-muted hover:text-text">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
