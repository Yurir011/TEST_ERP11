// 데스크톱 앱(Electron)에서 열렸을 때만 있는 기능. 앱이 화면에 노출한 window.benchClient 의 모양.
// 브라우저로 접속하면 benchClient 가 없으므로 항상 getBenchClient() 로 확인하고 쓴다.

export type NfcReaderState = "searching" | "connecting" | "ready" | "busy" | "error";

export interface NfcReaderStatus {
  state: NfcReaderState;
  port?: string;
  firmware?: string;
  message?: string;
}

export type DeviceApprovalStatus = "pending" | "approved" | "revoked" | "unknown";

export interface BenchClient {
  getVersion(): Promise<string>;
  nfc: {
    status(): Promise<NfcReaderStatus | null>;
    onStatus(cb: (status: NfcReaderStatus) => void): () => void;
    /** 카드가 리더에 닿을 때마다 호출된다. uid 는 대문자 16진수 */
    onCard(cb: (card: { uid: string }) => void): () => void;
  };
  device: {
    state(): Promise<{ status: DeviceApprovalStatus; error?: string } | null>;
    onStatus(cb: (state: { status: DeviceApprovalStatus; error?: string }) => void): () => void;
  };
  notify(title: string, body: string): Promise<void>;
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
