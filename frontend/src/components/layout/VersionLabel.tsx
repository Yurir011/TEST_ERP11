import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { sameVersion } from "../../lib/appVersion";
import { getBenchClient } from "../../lib/desktop";

/** 사이드바 아래의 버전 표시: 서버 버전(V.0.07.150). 데스크톱 앱이 서버와 다른 버전이면 앱 버전도 함께 보여 준다(문의할 때 확인용). */
export function VersionLabel() {
  const [server, setServer] = useState<string | null>(null);
  const [app, setApp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ version?: string }>("/api/health")
      .then((h) => !cancelled && setServer(h.version ?? null))
      .catch(() => undefined); // 버전 표시는 없어도 된다
    getBenchClient()
      ?.getVersion()
      .then((v) => !cancelled && setApp(v || null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!server && !app) return null;
  const differs = !!app && !!server && !sameVersion(app, server);
  return (
    <p className="px-2 pt-2 text-[11px] text-text-muted" title={app ? `서버 ${server ?? "?"} · 앱 ${app}` : "서버 버전"}>
      {server ?? app}
      {differs && <span className="text-tile-orange-fg"> · 앱 {app}</span>}
    </p>
  );
}
