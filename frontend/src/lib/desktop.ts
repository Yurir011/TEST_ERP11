// 데스크톱 앱(Electron)에서 열렸을 때만 있는 기능. 앱이 화면에 노출한 window.benchClient 의 모양.
// 브라우저로 접속하면 benchClient 가 없으므로 항상 getBenchClient() 로 확인하고 쓴다.

export type NfcReaderState = "searching" | "connecting" | "ready" | "busy" | "error";

export interface NfcReaderStatus {
  state: NfcReaderState;
  port?: string;
  firmware?: string;
  message?: string;
}

/** 앱이 카드로 로그인을 요청한 결과. 카드 번호는 오지 않는다. */
export type NfcLoginResult = { ok: true; token: string } | { ok: false; error: string };

/** 카드가 닿았을 때 앱이 할 일: off(기본) / login(로그인 화면, 앱이 서버에 로그인 요청) / capture(카드 등록 중, 번호를 화면에 전달) */
export type NfcMode = "off" | "login" | "capture";

export type DeviceApprovalStatus = "pending" | "approved" | "revoked" | "unknown";

export interface BenchClient {
  /** 앱 버전 (화면 표기 V.0.07.150) */
  getVersion(): Promise<string>;
  nfc: {
    status(): Promise<NfcReaderStatus | null>;
    onStatus(cb: (status: NfcReaderStatus) => void): () => void;
    setMode(mode: NfcMode): Promise<void>;
    /** capture 모드에서 카드가 리더에 닿을 때 호출된다. uid 는 대문자 16진수 */
    onCard(cb: (card: { uid: string }) => void): () => void;
    /** login 모드에서 카드로 로그인한 결과 */
    onLogin(cb: (result: NfcLoginResult) => void): () => void;
  };
  device: {
    state(): Promise<{ status: DeviceApprovalStatus; error?: string } | null>;
    onStatus(cb: (state: { status: DeviceApprovalStatus; error?: string }) => void): () => void;
  };
  /** 시스템 알림. conversationId 를 주면 알림을 눌렀을 때 onOpenConversation 신호가 온다 */
  notify(title: string, body: string, conversationId?: number): Promise<void>;
  /** 알림을 눌렀을 때 그 대화방을 열라는 신호 */
  onOpenConversation(cb: (payload: { conversationId: number }) => void): () => void;
  setBadge(count: number): Promise<void>;
}

declare global {
  interface Window {
    benchClient?: BenchClient;
  }
}

export function getBenchClient(): BenchClient | undefined {
  return typeof window === "undefined" ? undefined : window.benchClient;
}

export const NFC_STATE_LABELS: Record<NfcReaderState, string> = {
  ready: "리더 연결됨",
  searching: "리더를 찾는 중",
  connecting: "리더에 연결하는 중",
  busy: "다른 프로그램이 리더를 사용 중",
  error: "리더 오류",
};
