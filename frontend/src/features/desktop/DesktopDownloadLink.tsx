import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { getBenchClient } from "../../lib/desktop";

interface PublicRelease {
  version: string;
  display: string;
  filename: string;
  size: number;
}

function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

/**
 * 데스크톱 앱 설치 파일 받기 링크 (로그인 화면과 사이드바 맨 아래).
 * 로그인 없이 내려받는 공개 주소(/api/client/public/download)를 쓴다. 이미 앱 안에서 보고 있으면 보이지 않고,
 * 서버에 설치 파일이 놓여 있지 않으면(또는 조회에 실패하면) 링크 자체를 숨긴다.
 */
export function DesktopDownloadLink({ className = "" }: { className?: string }) {
  const [release, setRelease] = useState<PublicRelease | null>(null);
  const inApp = !!getBenchClient();

  useEffect(() => {
    if (inApp) return;
    let cancelled = false;
    apiGet<PublicRelease | null>("/api/client/public/latest")
      .then((r) => !cancelled && setRelease(r))
      .catch(() => console.debug("[Download] 설치 파일 정보 조회 실패 (링크를 숨깁니다)")); // 링크는 없어도 되는 부가 기능이다
    return () => {
      cancelled = true;
    };
  }, [inApp]);

  if (inApp || !release) return null;
  return (
    <a
      href="/api/client/public/download"
      download={release.filename}
      onClick={() => console.debug(`[Download] 설치 파일 내려받기 시작: ${release.display}`)}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors ${className}`}
      title={`${release.filename} (${sizeText(release.size)})`}
    >
      <Download size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-medium">데스크톱 앱 설치 파일 받기</span>
        <span className="block text-[11px] text-text-muted">
          {release.display} · Windows · {sizeText(release.size)}
        </span>
      </span>
    </a>
  );
}
