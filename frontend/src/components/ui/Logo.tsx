import logoUrl from "../../assets/bench-logo.png";

interface LogoProps {
  /** 로고 이미지 높이(px). 이전 아이콘 크기 값을 그대로 받아 호출하는 곳을 바꾸지 않아도 된다. */
  iconSize?: number;
  /** 예전 글자 크기 값 (이미지 로고로 바뀌면서 쓰지 않는다) */
  textSize?: number;
  className?: string;
  /** true 면 앞의 원형 마크만 보이고 BENCH 글자는 오른쪽에서부터 접힌다 (사이드바를 줄였을 때). 마크 위치는 그대로다. */
  markOnly?: boolean;
}

// 로고(BENCH_CI-01.png): 원형 크로스헤어 + BENCH 워드마크가 한 장의 이미지다 (836x192).
// 마크는 이미지 왼쪽의 정사각형(높이 = 너비)이라, 보이는 너비를 높이까지 줄이면 마크만 남는다.
const IMAGE_RATIO = 836 / 192;

export function Logo({ iconSize = 26, className = "", markOnly = false }: LogoProps) {
  const height = Math.round(iconSize * 1.15);
  const fullWidth = Math.round(height * IMAGE_RATIO);
  return (
    <span
      className={`block overflow-hidden shrink-0 transition-[width] duration-150 ${className}`}
      style={{ height, width: markOnly ? height : fullWidth }}
    >
      <img src={logoUrl} alt="BENCH" style={{ height, width: fullWidth }} className="block max-w-none select-none" draggable={false} />
    </span>
  );
}
