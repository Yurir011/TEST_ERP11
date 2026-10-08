import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useViewportLock } from "./useViewportLock";

interface MobileLayoutProps {
  title: string;
  /** 지정하면 왼쪽 위에 뒤로가기 버튼을 보여준다 (기본 경로로 이동, 없으면 이전 화면). */
  backTo?: string;
  right?: ReactNode;
  children: ReactNode;
}

/** 모바일 하위 화면의 공통 틀: 상단 제목줄(뒤로가기) + 본문. 노치/홈바 안전영역을 반영한다. */
export function MobileLayout({ title, backTo = "/m", right, children }: MobileLayoutProps) {
  const navigate = useNavigate();
  useViewportLock();
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="max-w-lg mx-auto h-12 px-2 flex items-center">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label="뒤로가기"
            className="w-10 h-10 flex items-center justify-center text-primary"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="flex-1 text-base font-bold truncate">{title}</h1>
          {right}
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4">{children}</main>
    </div>
  );
}

export function MobileCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-border rounded-2xl p-4 ${className}`}>{children}</div>;
}

export function MobileEmpty({ text }: { text: string }) {
  return <p className="text-sm text-text-muted text-center py-10">{text}</p>;
}
