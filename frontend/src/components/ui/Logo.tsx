import logoUrl from "../../assets/bench-logo.png";

interface LogoProps {
  /** 로고 이미지 높이(px). 이전 아이콘 크기 값을 그대로 받아 호출하는 곳을 바꾸지 않아도 된다. */
  iconSize?: number;
  /** 예전 글자 크기 값 (이미지 로고로 바뀌면서 쓰지 않는다) */
  textSize?: number;
  className?: string;
}

// 로고(BENCH_CI-01.png): 원형 크로스헤어 + BENCH 워드마크가 한 장의 이미지다 (836x192).
export function Logo({ iconSize = 26, className = "" }: LogoProps) {
  return <img src={logoUrl} alt="BENCH" style={{ height: Math.round(iconSize * 1.15) }} className={`block w-auto select-none ${className}`} draggable={false} />;
}
