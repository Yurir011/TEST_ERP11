/**
 * BENCH ERP 데스크톱 클라이언트 (Electron main).
 * 화면은 설정된 서버(사내 ERP)에서 그대로 불러오고, 이 앱은 PC 기능(NFC 리더, 트레이, 알림)만 맡는다.
 *
 * 실행 옵션: --smoke  창을 띄워 보안 설정과 화면 연결 통로만 확인하고 곧바로 종료한다 (종료 코드 0 = 정상).
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { BrowserWindow, Menu, Notification, Tray, app, ipcMain, nativeImage, safeStorage, session, shell } from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";

import { type DeviceKey, type DeviceStatusName, type SecretStore, defaultDeviceName, loadOrCreateDeviceKey, registerDevice } from "./device";
import { getLogger } from "./log";
import { serialPortProvider } from "./nfc/port";
import { NfcReader, type NfcStatus } from "./nfc/reader";
import { type AppConfig, checkHealth, classifySender, decideWindowOpen, isAllowedNavigation, loadConfig, normalizeServerUrl, saveConfig } from "./serverConfig";

const log = getLogger("Main");
const SMOKE = process.argv.includes("--smoke");

const ROOT = path.join(__dirname, "..");
const SHELL_FILE = path.join(ROOT, "renderer", "shell.html");
const PRELOAD = path.join(__dirname, "preload.js");
const ICON = path.join(ROOT, "assets", "icon.png");
const TRAY_ICON = path.join(ROOT, "assets", "tray.png");

if (SMOKE) app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "bench-smoke-")));
else if (process.env.BENCH_USER_DATA) app.setPath("userData", process.env.BENCH_USER_DATA); // 개발용 실행(--local): 설정·기기 키를 따로 둔다

let config: AppConfig = {};
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let reader: NfcReader | null = null;
let quitting = false;
let deviceKey: DeviceKey | null = null;
let deviceState: { status: DeviceStatusName | "unknown"; error?: string } = { status: "unknown" };
let deviceTimer: ReturnType<typeof setInterval> | null = null;
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


/** 기본 프로그램(메일, 브라우저)으로 여는 통로. smoke 에서는 실제로 열지 않고 기록만 하도록 바꿔 끼운다. */
let openExternal: (url: string) => Promise<void> = (url) => shell.openExternal(url);

const CHILD_WINDOW_OPTIONS = {
  width: 1100,
  height: 850,
  autoHideMenuBar: true,
  icon: ICON,
  // 새 창에는 benchClient(NFC·알림)를 주지 않는다. 부모의 preload 를 이어받지 않도록 비워 둔다.
  webPreferences: { preload: "", contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
};

/**
 * 창(메인 창과 PDF·이미지 새 창 모두)에 같은 규칙을 건다.
 *  - 서버 주소 밖으로 이동하지 못한다.
 *  - window.open / target=_blank: 같은 서버의 페이지와 blob(PDF·이미지 열기)은 앱 안의 새 창, mailto/tel 과 다른 사이트는 기본 프로그램, 나머지는 막는다.
 */
function hardenWindow(w: BrowserWindow): void {
  const wc: WebContents = w.webContents;
  wc.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, config.serverUrl, SHELL_FILE)) {
      event.preventDefault();
      log.warn(`[Main] 허용되지 않은 이동 차단: ${safeOrigin(url)}`);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen(url, config.serverUrl);
    log.debug(`[Main] 새 창 요청: ${new URL(url, "http://invalid").protocol} → ${decision}`);
    if (decision === "app-window") return { action: "allow", overrideBrowserWindowOptions: CHILD_WINDOW_OPTIONS };
    if (decision === "external") {
      openExternal(url).catch((err: Error) => log.error(`[Main] 외부 프로그램 열기 실패: ${err.message}`));
    } else {
      log.warn(`[Main] 허용되지 않은 새 창 차단: ${safeOrigin(url)}`);
    }
    return { action: "deny" };
  });
  wc.on("did-create-window", (child) => hardenWindow(child));
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

  hardenWindow(w);
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

  ipcMain.handle("device:state", (e) => (guard(e, "device:state", ["shell", "server"]) ? deviceState : null));

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


/** Electron safeStorage(Windows DPAPI / macOS Keychain / Linux libsecret)를 기기 키 보관용 저장소로 쓴다 */
const secretStore: SecretStore = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain.toString("base64")),
  decrypt: (cipher) => Buffer.from(safeStorage.decryptString(cipher), "base64"),
};

function setDeviceState(next: typeof deviceState): void {
  const changed = next.status !== deviceState.status || next.error !== deviceState.error;
  deviceState = next;
  if (!changed) return;
  log.info(`[Device] 상태: ${next.status}${next.error ? ` - ${next.error}` : ""}`);
  if (win && !win.isDestroyed()) win.webContents.send("device:status", next);
}

/** 서버에 이 PC 를 등록하거나 승인 상태를 확인한다. 승인 전에는 1분마다 다시 확인한다. */
async function refreshDevice(): Promise<void> {
  if (!deviceKey || !config.serverUrl) return;
  const r = await registerDevice(config.serverUrl, deviceKey, defaultDeviceName());
  setDeviceState(r.ok ? { status: r.status } : { status: deviceState.status, error: r.error });
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

const MINIMAL_PDF = [
  "%PDF-1.4",
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
  "4 0 obj<</Length 44>>stream",
  "BT /F1 36 Tf 40 100 Td (BENCH) Tj ET",
  "endstream endobj",
  "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
  "trailer<</Root 1 0 R/Size 6>>",
  "%%EOF",
].join(String.fromCharCode(10));

/** --smoke: 보안 설정과 통로, 그리고 서버 화면에서의 팝업·다운로드가 의도대로인지 확인한다 */
async function runSmoke(): Promise<void> {
  const w = win!;
  const checks: [string, boolean][] = [];
  const check = (name: string, ok: boolean) => {
    checks.push([name, ok]);
    log.info(`[Smoke] ${ok ? "통과" : "실패"}: ${name}`);
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (cond: () => boolean, ms = 8000) => {
    for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await sleep(50);
    return cond();
  };

  // 1) 안내 화면: 통로와 보안
  await new Promise<void>((resolve) => w.webContents.once("did-finish-load", () => resolve()));
  const shellInfo = (await w.webContents.executeJavaScript(`(async () => ({
    bridge: typeof window.benchClient, version: await window.benchClient.getVersion(),
    nfcStatus: (await window.benchClient.nfc.status())?.state ?? null,
    hasRequire: typeof require, hasProcess: typeof process, shellState: (await window.benchClient.shell.state())?.mode,
  }))()`)) as Record<string, unknown>;
  log.info(`[Smoke] 안내 화면: ${JSON.stringify(shellInfo)}`);
  check("안내 화면: 통로 있음, require/process 없음", shellInfo.bridge === "object" && shellInfo.hasRequire === "undefined" && shellInfo.hasProcess === "undefined" && shellInfo.shellState === "setup" && !!shellInfo.version);
  check("다른 사이트로 이동 차단", !isAllowedNavigation("https://example.com/", config.serverUrl, SHELL_FILE));

  // 2) 서버 화면(가짜 서버): 팝업·다운로드
  const pageHtml = "<!doctype html><title>smoke</title><body>smoke</body>";
  let registered: { name: string; public_key: string } | null = null;
  const server = http.createServer((req, res) => {
    if (req.url === "/api/health") res.end('{"status":"ok"}');
    else if (req.url === "/api/devices/register" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        registered = JSON.parse(body) as { name: string; public_key: string };
        res.setHeader("Content-Type", "application/json");
        res.end('{"status":"pending"}');
      });
    }
    else res.setHeader("Content-Type", "text/html; charset=utf-8"), res.end(pageHtml);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  config = { serverUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  const externalOpened: string[] = [];
  openExternal = async (url) => void externalOpened.push(url);
  const savedDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-dl-"));
  let downloaded: string | null = null;
  session.defaultSession.on("will-download", (_e, item) => {
    const target = path.join(savedDir, item.getFilename());
    item.setSavePath(target);
    item.once("done", (_ev, state) => { if (state === "completed") downloaded = target; });
  });

  await w.loadURL(config.serverUrl!);
  await refreshDevice();
  const reg = registered as { name: string; public_key: string } | null; // 서버 핸들러에서 채워진다
  check("기기 등록 요청이 서버에 전달됨(공개키 64자 + 이름만)", !!reg && /^[0-9a-f]{64}$/.test(reg.public_key) && !!reg.name && Object.keys(reg).length === 2);
  const devState = (await w.webContents.executeJavaScript("window.benchClient.device.state()")) as { status: string } | null;
  check("서버 화면에서 기기 상태(pending)를 읽을 수 있다", devState?.status === "pending");
  const before = BrowserWindow.getAllWindows().length;
  const popup = (code: string) => w.webContents.executeJavaScript(code);

  // PDF 를 blob 으로 만들어 새 창으로 연다 (api.ts 의 openFile 과 같은 방식)
  await popup(`(() => { const u = URL.createObjectURL(new Blob([${JSON.stringify(MINIMAL_PDF)}], { type: "application/pdf" })); window.open(u, "_blank"); })()`);
  check("PDF(blob) 새 창이 열린다", await until(() => BrowserWindow.getAllWindows().length === before + 1));
  const child = BrowserWindow.getAllWindows().find((x) => x !== w);
  if (child) {
    await sleep(1500);
    const url = child.webContents.getURL();
    check("새 창 주소가 blob 이다", url.startsWith("blob:"));
    const childApi = await child.webContents.executeJavaScript("typeof window.benchClient").catch(() => "읽을 수 없음(PDF 보기 화면)");
    check("새 창에는 benchClient 가 없다", childApi !== "object");
    const img = await child.webContents.capturePage();
    const bmp = img.toBitmap();
    let dark = 0;
    for (let i = 0; i < bmp.length; i += 4) if (bmp[i] < 200 || bmp[i + 1] < 200 || bmp[i + 2] < 200) dark++;
    log.info(`[Smoke] 새 창 화면 캡처: ${img.getSize().width}x${img.getSize().height}, 흰색이 아닌 점 ${dark}개`);
    check("새 창에 PDF 보기 화면이 그려졌다(빈 화면 아님, 글자까지는 확인 못 함)", dark > 500);
    child.destroy();
  }

  await popup(`window.open("mailto:a@b.com?subject=test", "_blank")`);
  await popup(`window.open("https://www.popbill.com/x", "_blank")`);
  await popup(`window.open("file:///C:/Windows/win.ini", "_blank")`);
  await popup(`window.open("javascript:alert(1)", "_blank")`);
  await sleep(500);
  check("mailto 는 기본 메일 프로그램으로", externalOpened.includes("mailto:a@b.com?subject=test"));
  check("다른 사이트(https)는 기본 브라우저로", externalOpened.includes("https://www.popbill.com/x"));
  check("file:/javascript: 는 아무것도 열지 않는다", BrowserWindow.getAllWindows().length === before && externalOpened.length === 2);

  // 파일 다운로드 (api.ts 의 downloadFile 과 같은 방식: blob + a[download])
  await popup(`(() => { const u = URL.createObjectURL(new Blob(["hello"], { type: "text/plain" })); const a = document.createElement("a"); a.href = u; a.download = "smoke.txt"; document.body.appendChild(a); a.click(); a.remove(); })()`);
  check("파일 다운로드가 된다", await until(() => downloaded !== null) && fs.readFileSync(downloaded!, "utf-8") === "hello");

  server.close();
  const ok = checks.every(([, c]) => c);
  log.info(`[Smoke] 결과: ${ok ? "정상" : "실패"} (${checks.filter(([, c]) => c).length}/${checks.length})`);
  quitting = true;
  await reader?.stop();
  app.exit(ok ? 0 : 1);
}

if (!app.requestSingleInstanceLock()) {
  log.info("[Main] 이미 실행 중이라 종료합니다");
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.on("before-quit", () => {
    quitting = true;
    if (deviceTimer) clearInterval(deviceTimer);
  });
  // 창이 모두 닫혀도(트레이로 내려가도) 앱은 끝내지 않는다
  app.on("window-all-closed", () => {});

  void app.whenReady().then(async () => {
    log.info(`[Main] 시작: v${app.getVersion()}, Electron ${process.versions.electron}${SMOKE ? " (smoke)" : ""}`);
    config = loadConfig(configFile(), log);
    if (!config.serverUrl && process.env.BENCH_SERVER_URL) {
      const preset = normalizeServerUrl(process.env.BENCH_SERVER_URL);
      if (preset.ok) config = { ...config, serverUrl: preset.url }; // 개발용 실행: 처음부터 이 서버로 (저장은 하지 않는다)
    }
    registerIpc();
    try {
      deviceKey = loadOrCreateDeviceKey(path.join(app.getPath("userData"), "device-key.json"), secretStore, getLogger("Device"));
    } catch (err) {
      log.error(`[Device] 기기 키를 준비하지 못했습니다: ${(err as Error).message}`);
    }
    win = createWindow();
    if (!SMOKE) createTray();
    startNfc();
    if (SMOKE) {
      showShell("setup");
      await runSmoke();
    } else {
      await openServer();
      void refreshDevice();
      deviceTimer = setInterval(() => void refreshDevice(), 60_000);
    }
  });
}
