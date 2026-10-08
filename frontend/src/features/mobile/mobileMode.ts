// 폰 화면 폭이면 처음 접속 시 모바일 화면(/m)으로 보내고, 사용자가 "PC 화면으로 보기"를 누르면 이 탭에서는 PC 화면을 유지한다.
const FORCE_PC_KEY = "erp_force_pc";

export function isForcePc(): boolean {
  try {
    return sessionStorage.getItem(FORCE_PC_KEY) === "1";
  } catch {
    return false;
  }
}

export function setForcePc(value: boolean) {
  try {
    if (value) sessionStorage.setItem(FORCE_PC_KEY, "1");
    else sessionStorage.removeItem(FORCE_PC_KEY);
  } catch {
    // 저장소를 쓸 수 없어도 화면 동작에는 문제 없다.
  }
}

export function shouldUseMobile(): boolean {
  return window.innerWidth < 768 && !isForcePc();
}
