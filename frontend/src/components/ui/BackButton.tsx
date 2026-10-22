import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** 작성 화면 왼쪽 위의 [뒤로가기]: 화살표만 있는 둥근 버튼. 눌러서 들어오기 전 화면으로 돌아간다 (아래쪽 [취소]와 같은 동작) */
export function BackButton({ className = "", disabled = false }: { className?: string; disabled?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      disabled={disabled}
      aria-label="뒤로가기"
      title="뒤로가기"
      className={`grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-text transition-colors hover:border-primary hover:text-primary disabled:opacity-60 ${className}`}
    >
      <ArrowLeft size={17} aria-hidden="true" />
    </button>
  );
}
