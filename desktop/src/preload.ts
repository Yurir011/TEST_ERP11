/**
 * 화면(웹)에 노출하는 기능은 여기 적힌 것이 전부다 (contextIsolation + sandbox).
 * 이 파일은 sandbox 안에서 돌기 때문에 electron 말고는 불러오지 않는다.
 * 서버 화면과 로컬 안내 화면 모두 같은 객체를 받지만, 어느 기능을 쓸 수 있는지는 main 이 보낸 곳을 보고 결정한다.
 */
import { contextBridge, ipcRenderer } from "electron";

type Unsubscribe = () => void;

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  nfc: {
    status: (): Promise<unknown> => ipcRenderer.invoke("nfc:status"),
    onStatus: (cb: (status: unknown) => void): Unsubscribe => subscribe("nfc:status", cb),
    onCard: (cb: (card: { uid: string }) => void): Unsubscribe => subscribe("nfc:card", cb),
  },
  notify: (title: string, body: string): Promise<void> => ipcRenderer.invoke("app:notify", title, body),
  setBadge: (count: number): Promise<void> => ipcRenderer.invoke("app:badge", count),
  shell: {
    state: (): Promise<{ serverUrl?: string; mode: string; error?: string }> => ipcRenderer.invoke("shell:state"),
    saveServer: (url: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("shell:save-server", url),
    retry: (): Promise<void> => ipcRenderer.invoke("shell:retry"),
  },
};

contextBridge.exposeInMainWorld("benchClient", api);
