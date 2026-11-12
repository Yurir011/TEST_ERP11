/**
 * 데스크톱 앱이 따로 여는 메신저 창인지 알아낸다.
 * 앱은 메신저 창을 `/messenger?window=1` 로 열고, 그 창 안에서 대화방을 옮겨 다녀도(주소의 ?window=1 이 사라져도)
 * 메신저 창으로 남도록 처음 한 번 sessionStorage(창마다 따로)에 표시해 둔다.
 */
const KEY = "bench-window-kind";

export function isMessengerWindow(pathname: string, search: string): boolean {
  if (!pathname.startsWith("/messenger")) return false;
  try {
    if (new URLSearchParams(search).get("window") === "1") sessionStorage.setItem(KEY, "messenger");
    return sessionStorage.getItem(KEY) === "messenger";
  } catch {
    return false;
  }
}
