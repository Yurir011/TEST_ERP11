/**
 * BENCH ERP 데스크톱 클라이언트 (Electron main).
 * 화면은 설정된 서버(사내 ERP)에서 그대로 불러오고, 이 앱은 PC 기능(NFC 리더, 트레이, 알림)만 맡는다.
 *
 * 실행 옵션: --smoke  창을 띄워 보안 설정과 화면 연결 통로만 확인하고 곧바로 종료한다 (종료 코드 0 = 정상).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BrowserWindow, Menu, Notification, Tray, app, ipcMain, nativeImage, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";

import { getLogger } from "./log";
import { serialPortProvider } from "./nfc/port";
import { NfcReader, type NfcStatus } from "./nfc/reader";
import { type AppConfig, checkHealth, classifySender, isAllowedNavigation, loadConfig, normalizeServerUrl, saveConfig } from "./serverConfig";

const log = getLogger("Main");
const SMOKE = process.argv.includes("--smoke");

const ROOT = path.join(__dirname, "..");
const SHELL_FILE = path.join(ROOT, "renderer", "shell.html");
const PRELOAD = path.join(__dirname, "preload.js");
const ICON = path.join(ROOT, "assets", "icon.png");
const TRAY_ICON = path.join(ROOT, "assets", "tray.png");

if (SMOKE) app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "bench-smoke-")));

let config: AppConfig = {};
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let reader: NfcReader | null = null;
let quitting = false;
let shellState: { mode: "setup" | "offline"; error?: string } = { mode: "setup" };

const configFile = () => path.join(app.getPath("userData"), "config.json");

function sender(e: IpcMainInvokeEvent) {
  const url = e.senderFrame?.url ?? "";
  return classifySender(url, config.serverUrl, SHELL_FILE);
}

/** 서버 화면이나 안내 화면에서 온 요청만 받는다. 아니면 거절하고 기록한다. */
function guard(e: IpcMainInvokeEvent, channel: string, allow: ("shell" | "server")[]): boolean {
  const kind = sender(e);
  if (kind && allow.includes(kind)) return true;
  log.warn(`[IPC] 허용되지 않은 요청 거절: ${channel} (출처: ${e.senderFrame?.url ?? "알 수 없음"})`);
  return false;
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: !SMOKE,
    title: "BENCH ERP",
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // 서버 주소 밖으로는 나가지 않는다. 외부 링크는 기본 브라우저로 연다.
  w.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, config.serverUrl, SHELL_FILE)) {
      event.preventDefault();
      log.warn(`[Main] 허용되지 않은 이동 차단: ${safeOrigin(url)}`);
    }
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  w.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* 이동 취소 */) return;
    log.error(`[Main] 화면 불러오기 실패: ${safeOrigin(url)} (${code} ${desc})`);
    if (config.serverUrl && url.startsWith(config.serverUrl)) showShell("offline", "서버에서 화면을 불러오지 못했습니다.");
  });
  w.on("close", (event) => {
    if (quitting || SMOKE) return;
    event.preventDefault(); // 창을 닫아도 트레이에 남아 알림을 계속 받는다
    w.hide();
  });
  return w;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "(잘못된 주소)";
  }
}

function showShell(mode: "setup" | "offline", error?: string): void {
  shellState = { mode, error };
  if (!win) return;
  log.info(`[Main] 안내 화면 표시: ${mode}${error ? ` - ${error}` : ""}`);
  void win.loadFile(SHELL_FILE, { query: { mode } });
}

async function openServer(): Promise<void> {
  if (!win) return;
  if (!config.serverUrl) return showShell("setup");
  const health = await checkHealth(config.serverUrl);
  if (!health.ok) {
    log.warn(`[Main] 서버 연결 실패: ${health.error}`);
    return showShell("offline", health.error);
  }
  log.info(`[Main] 서버 화면 불러오기: ${config.serverUrl}`);
  await win.loadURL(config.serverUrl).catch((err: Error) => log.error(`[Main] loadURL 실패: ${err.message}`));
}

function currentIsServerPage(): boolean {
  return !!win && !win.isDestroyed() && classifySender(win.webContents.getURL(), config.serverUrl, SHELL_FILE) === "server";
}

function startNfc(): void {
  reader = new NfcReader(serialPortProvider({ preferred: config.nfcPort, log: getLogger("NFC") }), { log: getLogger("NFC") });
  reader.on("status", (s: NfcStatus) => {
    if (win && !win.isDestroyed()) win.webContents.send("nfc:status", s);
  });
  // 카드 UID 는 서버 화면에만 전달한다 (안내 화면이나 다른 주소로 새어 나가지 않게)
  reader.on("card", (t: { uid: string }) => {
    if (currentIsServerPage()) win?.webContents.send("nfc:card", { uid: t.uid });
  });
  reader.start();
}

function registerIpc(): void {
  ipcMain.handle("app:version", (e) => (guard(e, "app:version", ["shell", "server"]) ? app.getVersion() : ""));
  ipcMain.handle("nfc:status", (e) => (guard(e, "nfc:status", ["shell", "server"]) ? (reader?.getStatus() ?? { state: "searching" }) : null));

  ipcMain.handle("app:notify", (e, title: unknown, body: unknown) => {
    if (!guard(e, "app:notify", ["server"])) return;
    if (typeof title !== "string" || typeof body !== "string") return;
    const n = new Notification({ title: title.slice(0, 100), body: body.slice(0, 300), icon: ICON });
    n.on("click", () => showWindow());
    n.show();
  });

  ipcMain.handle("app:badge", (e, count: unknown) => {
    if (!guard(e, "app:badge", ["server"])) return;
    const n = Number.isFinite(count) ? Math.max(0, Math.min(999, Math.trunc(count as number))) : 0;
    app.setBadgeCount(n); // macOS/Linux
    tray?.setToolTip(n > 0 ? `BENCH ERP (안 읽은 ${n}건)` : "BENCH ERP");
  });

  ipcMain.handle("shell:state", (e) => {
    if (!guard(e, "shell:state", ["shell"])) return null;
    return { serverUrl: config.serverUrl, ...shellState };
  });

  ipcMain.handle("shell:save-server", async (e, input: unknown) => {
    if (!guard(e, "shell:save-server", ["shell"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const check = normalizeServerUrl(typeof input === "string" ? input : "");
    if (!check.ok) return check;
    const health = await checkHealth(check.url);
    if (!health.ok) return health;
    config = { ...config, serverUrl: check.url };
    saveConfig(configFile(), config);
    log.info(`[Main] 서버 주소 저장: ${check.url}`);
    setTimeout(() => void openServer(), 0);
    return { ok: true };
  });

  ipcMain.handle("shell:retry", (e) => {
    if (!guard(e, "shell:retry", ["shell"])) return;
    void openServer();
  });
}

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip("BENCH ERP");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "BENCH ERP 열기", click: showWindow },
      { label: "서버 주소 변경", click: () => { showWindow(); showShell("setup"); } },
      { type: "separator" },
      { label: "종료", click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on("click", showWindow);
}

/** --smoke: 보안 설정과 통로가 의도대로인지 확인한다 */
async function runSmoke(): Promise<void> {
  const w = win!;
  await new Promise<void>((resolve) => w.webContents.once("did-finish-load", () => resolve()));
  const result = (await w.webContents.executeJavaScript(`(async () => ({
    bridge: typeof window.benchClient,
    version: await window.benchClient.getVersion(),
    nfcStatus: (await window.benchClient.nfc.status())?.state ?? null,
    hasRequire: typeof require,
    hasProcess: typeof process,
    shellState: (await window.benchClient.shell.state())?.mode,
  }))()`)) as Record<string, unknown>;
  log.info(`[Smoke] ${JSON.stringify(result)}`);
  const ok = result.bridge === "object" && result.hasRequire === "undefined" && result.hasProcess === "undefined" && result.shellState === "setup" && !!result.version;
  // 허용되지 않은 이동은 막혀야 한다
  const blocked = !isAllowedNavigation("https://example.com/", config.serverUrl, SHELL_FILE);
  log.info(`[Smoke] 결과: ${ok && blocked ? "정상" : "실패"}`);
  quitting = true;
  await reader?.stop();
  app.exit(ok && blocked ? 0 : 1);
}

if (!app.requestSingleInstanceLock()) {
  log.info("[Main] 이미 실행 중이라 종료합니다");
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("before-quit", () => {
    quitting = true;
  });
  // 창이 모두 닫혀도(트레이로 내려가도) 앱은 끝내지 않는다
  app.on("window-all-closed", () => {});

  void app.whenReady().then(async () => {
    log.info(`[Main] 시작: v${app.getVersion()}, Electron ${process.versions.electron}${SMOKE ? " (smoke)" : ""}`);
    config = loadConfig(configFile(), log);
    registerIpc();
    win = createWindow();
    if (!SMOKE) createTray();
    startNfc();
    if (SMOKE) {
      showShell("setup");
      await runSmoke();
    } else {
      await openServer();
    }
  });
}
