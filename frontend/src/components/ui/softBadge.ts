/**
 * 컬러 배지 공통 스타일(시안 F): 사각 모서리 + 옅은 바탕(타일 색 70%) + 한 단계 진한 글씨(글자색 72% + 본문색).
 * 모양(rounded-md)까지 포함하므로 사용하는 쪽에서는 rounded-full을 붙이지 않는다.
 * Tailwind가 클래스를 소스에서 그대로 찾기 때문에 색마다 전체 문자열을 적어 두었다.
 */
export const SOFT_BADGE = {
  blue: "rounded-md bg-[color-mix(in_srgb,var(--color-tile-blue)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-tile-blue-fg)_72%,var(--color-text))]",
  green: "rounded-md bg-[color-mix(in_srgb,var(--color-tile-green)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-tile-green-fg)_72%,var(--color-text))]",
  orange: "rounded-md bg-[color-mix(in_srgb,var(--color-tile-orange)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-tile-orange-fg)_72%,var(--color-text))]",
  purple: "rounded-md bg-[color-mix(in_srgb,var(--color-tile-purple)_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-tile-purple-fg)_72%,var(--color-text))]",
  red: "rounded-md bg-[color-mix(in_srgb,#fef2f2_70%,var(--color-surface))] text-[color-mix(in_srgb,var(--color-danger)_72%,var(--color-text))]",
  gray: "rounded-md bg-[color-mix(in_srgb,#f1f2f4_70%,var(--color-surface))] text-[color-mix(in_srgb,#4b5563_72%,var(--color-text))]",
} as const;
