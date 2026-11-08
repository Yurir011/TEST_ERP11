import { apiDelete, apiPost } from "./api";
import { logDebug, logError } from "./logger";

// 모바일 푸시(FCM). 아이폰 앱(Capacitor) 안에서만 동작하고, 일반 브라우저에서는 아무 일도 하지 않는다.
// 앱은 서버의 /m 화면을 열어도 window.Capacitor 를 주입하므로 별도 패키지 없이 플러그인을 호출할 수 있다.

interface FirebaseMessagingPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  getToken(): Promise<{ token: string }>;
  deleteToken(): Promise<void>;
  addListener(event: string, cb: (e: unknown) => void): Promise<{ remove: () => Promise<void> }>;
}

interface CapacitorGlobal {
  Plugins?: { FirebaseMessaging?: FirebaseMessagingPlugin };
  getPlatform?: () => string;
}

const TOKEN_KEY = "bench.push.token"; // 이 기기에서 마지막으로 서버에 등록한 토큰 (로그아웃 때 서버에서 지우는 데 쓴다)

const capacitor = (): CapacitorGlobal | undefined => (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
const plugin = (): FirebaseMessagingPlugin | undefined => capacitor()?.Plugins?.FirebaseMessaging;

const shortToken = (t: string) => `${t.slice(0, 8)}…`;

function readSavedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장하지 못해도 푸시 등록에는 지장 없다 */
  }
}

/** 푸시를 받을 수 있는 환경(앱 안)인가 */
export const isPushAvailable = () => plugin() !== undefined;

async function sendTokenToServer(token: string) {
  const platform = capacitor()?.getPlatform?.() === "android" ? "android" : "ios";
  await apiPost("/api/push/devices", { token, platform });
  saveToken(token);
  logDebug("Push", `서버에 토큰 등록 완료: ${shortToken(token)}`);
}

/** 알림 권한을 받고(처음 한 번 팝업) 이 기기의 토큰을 서버에 등록한다. 앱이 아니면 false. 로그인한 상태에서 호출한다. */
export async function registerPush(): Promise<boolean> {
  const fm = plugin();
  if (!fm) return false;
  try {
    logDebug("Push", "권한 확인 시작");
    const perm = await fm.requestPermissions();
    if (perm.receive !== "granted") {
      logDebug("Push", `권한 거부됨: ${perm.receive}`);
      return false;
    }
    const { token } = await fm.getToken();
    logDebug("Push", `토큰 발급 성공: ${shortToken(token)}`);
    await sendTokenToServer(token);
    return true;
  } catch (err) {
    logError("Push", "푸시 등록 실패", err);
    return false;
  }
}

/**
 * 로그아웃하는 폰이 이전 계정의 알림을 받지 않도록 서버의 토큰을 지운다.
 * 서버 요청은 로그인 토큰을 지우기 전에 시작해야 하므로, 첫 await 전에 동기적으로 보낸다 (logout 이 바로 이어서 토큰을 지운다).
 */
export function unregisterPush(): void {
  const token = readSavedToken();
  if (!token) return;
  logDebug("Push", `서버에서 토큰 해제: ${shortToken(token)}`);
  apiDelete("/api/push/devices", { token })
    .catch((err) => logError("Push", "서버 토큰 해제 실패", err))
    .finally(() => saveToken(null));
  const fm = plugin();
  if (fm) void fm.deleteToken().catch((err) => logError("Push", "기기 토큰 삭제 실패", err));
}

/**
 * 알림을 탭했을 때(onTap)와 토큰이 바뀌었을 때(재등록)를 듣는다. 돌려주는 함수로 해제한다.
 * 앱이 종료된 상태에서 탭해 시작된 경우에도 호출된다 (이동은 로그인이 확인된 뒤에 하도록 호출한 쪽이 처리한다).
 */
export function listenPush(onTap: (link: string | null) => void, canRegister: () => boolean): () => void {
  const fm = plugin();
  if (!fm) return () => undefined;
  const handles = [
    fm.addListener("notificationActionPerformed", (e) => {
      const data = (e as { notification?: { data?: { link?: unknown } } })?.notification?.data;
      const link = typeof data?.link === "string" ? data.link : null;
      logDebug("Push", `알림 탭: link=${link}`);
      onTap(link);
    }),
    fm.addListener("tokenReceived", (e) => {
      const token = (e as { token?: unknown })?.token;
      if (typeof token !== "string" || !canRegister()) return;
      logDebug("Push", `토큰 갱신됨: ${shortToken(token)}`);
      sendTokenToServer(token).catch((err) => logError("Push", "갱신된 토큰 등록 실패", err));
    }),
  ];
  return () => handles.forEach((h) => void h.then((x) => x.remove()).catch(() => undefined));
}
