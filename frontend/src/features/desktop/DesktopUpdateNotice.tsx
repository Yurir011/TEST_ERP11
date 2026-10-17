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

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * 데스크톱 앱에서만 보이는 새 버전 안내. 서버에 올라온 최신 버전이 지금 앱보다 새 것이면 위쪽에 안내와 [다운로드]를 보여 준다.
 * 자동으로 바꿔치기하지 않는다: 직원이 내려받은 설치 파일을 직접 실행한다. [나중에]를 누르면 이번 실행 동안 같은 버전은 다시 묻지 않는다.
 */
export function DesktopUpdateNotice() {
  const bench = getBenchClient();
  const dialog = useDialog();
  const [update, setUpdate] = useState<{ latest: ClientRelease; current: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bench) return;
    let cancelled = false;
    Promise.all([bench.getVersion(), apiGet<ClientRelease | null>("/api/client/latest")])
      .then(([current, latest]) => {
        if (cancelled || !latest || !isNewerVersion(latest.version, current)) return;
        logDebug("Update", `새 버전 안내: 현재 ${current} → ${latest.display}`);
        setUpdate({ latest, current });
        setDismissed(readDismissed() === latest.version);
      })
      .catch((err) => logError("Update", "최신 버전 확인 실패", err)); // 확인하지 못해도 업무에는 영향이 없다
    return () => {
      cancelled = true;
    };
  }, [bench]);

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

  function later() {
    try {
      sessionStorage.setItem(DISMISS_KEY, latest.version);
    } catch {
      /* 저장할 수 없어도 이 화면에서는 닫힌다 */
    }
    setDismissed(true);
  }

  return (
    <div role="status" aria-label="새 버전 안내" className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-tile-blue px-4 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <span className="font-medium">새 버전 {latest.display}이 있습니다</span>
        <span className="text-text-muted"> (현재 {formatVersion(current)})</span>
        {latest.notes && (
          <p className="text-xs text-text-muted truncate" title={latest.notes}>
            {latest.notes}
          </p>
        )}
      </div>
      <button type="button" onClick={() => void download()} disabled={busy} className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:bg-primary-hover disabled:opacity-60">
        {busy ? "받는 중..." : "다운로드"}
      </button>
      <button type="button" onClick={later} aria-label="나중에" title="나중에" className="p-1 text-text-muted hover:text-text">
        <X size={15} />
      </button>
    </div>
  );
}
