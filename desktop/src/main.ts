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

import { BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, nativeImage, safeStorage, session, shell } from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";

import { type DeviceKey, type DeviceStatusName, type SecretStore, defaultDeviceName, loadOrCreateDeviceKey, registerDevice, verifySignature } from "./device";
import { getLogger } from "./log";
import { MailAccountStore } from "./mail/account";
import { parseAttachmentIndex, parseFilter, parseFolderPath, parseMailId, parsePaging } from "./mail/args";
import { MailService, isDangerousFilename, safeFilename } from "./mail/service";
import { MailStore } from "./mail/store";
import { MailSync } from "./mail/sync";
import { loginMessage, performNfcLogin } from "./nfcLogin";
import { serialPortProvider } from "./nfc/port";
import { NfcReader, type NfcStatus } from "./nfc/reader";
import { type AppConfig, checkHealth, classifySender, decideWindowOpen, isAllowedNavigation, loadConfig, loadDefaultServer, normalizeServerUrl, saveConfig } from "./serverConfig";
import { badgeImageName, clampBadgeCount, loginItemSettings, parseConversationId, startsHidden } from "./startup";
import { formatVersion } from "./version";

const log = getLogger("Main");
const SMOKE = process.argv.includes("--smoke");
const HIDDEN_START = !SMOKE && startsHidden(process.argv); // 윈도우 시작 시 자동 실행으로 켜진 경우: 창 없이 트레이에만 시작

const ROOT = path.join(__dirname, "..");
const SHELL_FILE = path.join(ROOT, "renderer", "shell.html");
const PRELOAD = path.join(__dirname, "preload.js");
const ICON = path.join(ROOT, "assets", "icon.png");
const TRAY_ICON = path.join(ROOT, "assets", "tray.png");
const BADGE_DIR = path.join(ROOT, "assets", "badges");
const VERSION_LABEL = formatVersion(app.getVersion()); // 화면 표기: V.0.07.150

if (SMOKE) app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "bench-smoke-")));
else if (process.env.BENCH_USER_DATA) app.setPath("userData", process.env.BENCH_USER_DATA); // 개발용 실행(--local): 설정·기기 키를 따로 둔다

let config: AppConfig = {};
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let reader: NfcReader | null = null;
let quitting = false;
let deviceKey: DeviceKey | null = null;
/**
 * 카드가 닿았을 때 하는 일 (화면이 IPC 로 정한다):
 *  - off: 아무것도 하지 않는다 (기본)
 *  - login: 로그인 화면. 앱이 직접 서버에 카드 로그인을 요청하고, 화면에는 결과(토큰 또는 안내 문구)만 준다. 카드 번호는 화면에 주지 않는다.
 *  - capture: 직원 화면의 [카드 읽기]. 카드 번호를 화면에 준다 (등록용).
 * 화면이 새로 불러와지면(이동·새로고침) off 로 돌아간다.
 */
type NfcMode = "off" | "login" | "capture";
let nfcMode: NfcMode = "off";
let loginBusy = false;
let deviceState: { status: DeviceStatusName | "unknown"; error?: string } = { status: "unknown" };
let deviceTimer: ReturnType<typeof setInterval> | null = null;
let shellState: { mode: "setup" | "offline"; error?: string } = { mode: "setup" };
let mailWin: BrowserWindow | null = null;
let mail: MailService | null = null;
let mailStore: MailStore | null = null;

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
    show: !SMOKE && !HIDDEN_START,
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
  w.on("focus", () => w.flashFrame(false)); // 알림으로 깜박이던 작업 표시줄 아이콘은 창을 보면 멈춘다
  w.webContents.on("did-navigate", () => {
    nfcMode = "off"; // 새 화면은 카드 모드를 다시 정해야 한다
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

/**
 * 메일 전용 창. 메인 창과 별개의 창으로 열고, 메일 기능(benchClient.mail)을 쓸 수 있도록 같은 preload 를 준다.
 * 이미 열려 있으면 그 창을 앞으로 가져온다. PDF·이미지 새 창과 달리 서버 화면(/mail)만 불러온다.
 */
function openMailWindow(): void {
  if (!config.serverUrl || !mail) {
    log.warn("[Mail] 메일 창을 열 수 없습니다 (서버 주소 또는 메일 저장소 없음)");
    return;
  }
  if (mailWin && !mailWin.isDestroyed()) {
    if (mailWin.isMinimized()) mailWin.restore();
    mailWin.show();
    mailWin.focus();
    return;
  }
  const w = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 560,
    title: "BENCH 메일",
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  hardenWindow(w);
  w.on("closed", () => {
    if (mailWin === w) mailWin = null;
  });
  mailWin = w;
  void w.loadURL(`${config.serverUrl}/mail`);
  log.info("[Mail] 메일 창 열기");
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


/** 카드가 닿았을 때: 현재 모드에 따라 처리한다. 서버 화면이 열려 있을 때만 반응한다. */
async function handleCard(uid: string): Promise<void> {
  if (!currentIsServerPage() || !win) return;
  if (nfcMode === "capture") {
    win.webContents.send("nfc:card", { uid });
    return;
  }
  if (nfcMode !== "login") return;
  if (loginBusy) return;
  loginBusy = true;
  try {
    if (!deviceKey || !config.serverUrl) {
      win.webContents.send("nfc:login", { ok: false, error: "이 PC 의 기기 키를 준비하지 못했습니다. 앱을 다시 실행하세요." });
      return;
    }
    log.info(`[NFC] 카드 로그인 요청: 카드 끝 4자리 ${uid.slice(-4)}`);
    const result = await performNfcLogin(config.serverUrl, deviceKey, uid);
    log.info(`[NFC] 카드 로그인 결과: ${result.ok ? "성공" : `거절 - ${result.error}`}`);
    // 로그인 요청 중에 화면이 바뀌었거나 모드가 바뀌었으면 결과를 버린다 (토큰이 엉뚱한 화면으로 가지 않게)
    if (win && !win.isDestroyed() && currentIsServerPage() && nfcMode === "login") win.webContents.send("nfc:login", result);
  } finally {
    loginBusy = false;
  }
}

function startNfc(): void {
  reader = new NfcReader(serialPortProvider({ preferred: config.nfcPort, log: getLogger("NFC") }), { log: getLogger("NFC") });
  reader.on("status", (s: NfcStatus) => {
    if (win && !win.isDestroyed()) win.webContents.send("nfc:status", s);
  });
  reader.on("card", (t: { uid: string }) => void handleCard(t.uid));
  reader.start();
}

function registerIpc(): void {
  ipcMain.handle("app:version", (e) => (guard(e, "app:version", ["shell", "server"]) ? VERSION_LABEL : "")); // V.0.07.150 (비교에도 그대로 쓸 수 있다)
  ipcMain.handle("nfc:status", (e) => (guard(e, "nfc:status", ["shell", "server"]) ? (reader?.getStatus() ?? { state: "searching" }) : null));

  ipcMain.handle("nfc:set-mode", (e, mode: unknown) => {
    if (!guard(e, "nfc:set-mode", ["server"])) return;
    if (mode !== "off" && mode !== "login" && mode !== "capture") return;
    if (mode !== nfcMode) log.debug(`[NFC] 카드 모드 변경: ${nfcMode} → ${mode}`);
    nfcMode = mode;
  });

  ipcMain.handle("device:state", (e) => (guard(e, "device:state", ["shell", "server"]) ? deviceState : null));

  ipcMain.handle("app:notify", (e, title: unknown, body: unknown, conversationId?: unknown) => {
    if (!guard(e, "app:notify", ["server"])) return;
    if (typeof title !== "string" || typeof body !== "string") return;
    const id = parseConversationId(conversationId);
    const n = new Notification({ title: title.slice(0, 100), body: body.slice(0, 300), icon: ICON });
    n.on("click", () => {
      showWindow();
      if (id !== null) sendOpenConversation(id); // 알림을 누르면 그 대화방으로 바로 간다
    });
    n.show();
    if (win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true); // 작업 표시줄 아이콘 깜박임
  });

  ipcMain.handle("app:badge", (e, count: unknown) => {
    if (!guard(e, "app:badge", ["server"])) return;
    const n = clampBadgeCount(count);
    app.setBadgeCount(n); // macOS/Linux
    tray?.setToolTip(n > 0 ? `BENCH ERP ${VERSION_LABEL} (안 읽은 ${n}건)` : `BENCH ERP ${VERSION_LABEL}`);
    if (process.platform === "win32" && win && !win.isDestroyed()) {
      const name = badgeImageName(n);
      win.setOverlayIcon(name ? nativeImage.createFromPath(path.join(BADGE_DIR, name)) : null, n > 0 ? `안 읽은 메시지 ${n}건` : "");
    }
  });

  // ---- 메일 (서버 화면에서만. 비밀번호는 저장할 때 한 번 들어오고, 어떤 응답에도 담기지 않는다) ----
  const MAIL_UNAVAILABLE = { ok: false as const, error: "메일 기능을 시작하지 못했습니다. 앱을 다시 실행해 주세요." };

  ipcMain.handle("mail:open-window", (e) => {
    if (!guard(e, "mail:open-window", ["server"])) return;
    openMailWindow();
  });

  ipcMain.handle("mail:account", (e) => (guard(e, "mail:account", ["server"]) ? (mail?.accountInfo() ?? null) : null));

  ipcMain.handle("mail:account-save", async (e, input: unknown) => {
    if (!guard(e, "mail:account-save", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    return mail ? mail.saveAccount(input) : MAIL_UNAVAILABLE;
  });

  ipcMain.handle("mail:account-remove", (e) => {
    if (!guard(e, "mail:account-remove", ["server"])) return;
    mail?.removeAccount();
  });

  ipcMain.handle("mail:folders", (e) => (guard(e, "mail:folders", ["server"]) && mail ? mail.folders() : []));

  ipcMain.handle("mail:sync", async (e, folder: unknown) => {
    if (!guard(e, "mail:sync", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const f = parseFolderPath(folder);
    if (!f) return { ok: false, error: "폴더 이름이 올바르지 않습니다." };
    return mail ? mail.sync(f) : MAIL_UNAVAILABLE;
  });

  ipcMain.handle("mail:list", (e, folder: unknown, offset: unknown, limit: unknown, filter?: unknown) => {
    const f = parseFolderPath(folder);
    if (!guard(e, "mail:list", ["server"]) || !f || !mail) return { items: [], total: 0 };
    const p = parsePaging(offset, limit);
    return mail.list(f, p.offset, p.limit, parseFilter(filter));
  });

  ipcMain.handle("mail:get", async (e, id: unknown, allowRemoteImages: unknown) => {
    if (!guard(e, "mail:get", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const n = parseMailId(id);
    if (!n) return { ok: false, error: "메일 번호가 올바르지 않습니다." };
    return mail ? mail.get(n, { allowRemoteImages: allowRemoteImages === true }) : MAIL_UNAVAILABLE;
  });

  ipcMain.handle("mail:set-flagged", async (e, id: unknown, flagged: unknown) => {
    if (!guard(e, "mail:set-flagged", ["server"])) return;
    const n = parseMailId(id);
    if (n && mail && typeof flagged === "boolean") await mail.setFlagged(n, flagged);
  });

  ipcMain.handle("mail:mark-seen", async (e, id: unknown, seen: unknown) => {
    if (!guard(e, "mail:mark-seen", ["server"])) return;
    const n = parseMailId(id);
    if (n && mail && typeof seen === "boolean") await mail.markSeen(n, seen);
  });

  /** 첨부 저장: 저장 위치는 사용자가 고른다 */
  ipcMain.handle("mail:attachment-save", async (e, id: unknown, index: unknown) => {
    if (!guard(e, "mail:attachment-save", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const n = parseMailId(id);
    const i = parseAttachmentIndex(index);
    if (!n || i === null || !mail) return MAIL_UNAVAILABLE;
    const info = mail.attachmentInfo(n, i);
    if (!info) return { ok: false, error: "첨부 파일을 찾을 수 없습니다." };
    const target =
      win && !win.isDestroyed()
        ? await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("downloads"), safeFilename(info.filename)) })
        : { canceled: true, filePath: "" };
    if (target.canceled || !target.filePath) return { ok: false, error: "취소했습니다.", canceled: true };
    const r = await mail.writeAttachment(n, i, target.filePath);
    if (r.ok) log.info(`[Mail] 첨부 저장: ${path.basename(target.filePath)}`);
    return r;
  });

  /** 첨부 열기: 임시 폴더에 풀어서 연다. 실행 파일 종류는 한 번 더 확인한다 */
  ipcMain.handle("mail:attachment-open", async (e, id: unknown, index: unknown) => {
    if (!guard(e, "mail:attachment-open", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const n = parseMailId(id);
    const i = parseAttachmentIndex(index);
    if (!n || i === null || !mail) return MAIL_UNAVAILABLE;
    const info = mail.attachmentInfo(n, i);
    if (!info) return { ok: false, error: "첨부 파일을 찾을 수 없습니다." };
    if (isDangerousFilename(info.filename)) {
      const answer =
        win && !win.isDestroyed()
          ? await dialog.showMessageBox(win, {
              type: "warning",
              buttons: ["열지 않기", "그래도 열기"],
              defaultId: 0,
              cancelId: 0,
              title: "위험할 수 있는 파일",
              message: `'${safeFilename(info.filename)}' 은 프로그램을 실행하는 파일일 수 있습니다.`,
              detail: "보낸 사람을 확인하지 못했다면 열지 마세요. 열면 컴퓨터가 감염될 수 있습니다.",
            })
          : { response: 0 };
      if (answer.response !== 1) return { ok: false, error: "취소했습니다.", canceled: true };
    }
    const dir = path.join(app.getPath("userData"), "mail", "open-tmp", String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, safeFilename(info.filename));
    const r = await mail.writeAttachment(n, i, file);
    if (!r.ok) return r;
    const err = await shell.openPath(file);
    return err ? { ok: false, error: "이 파일을 열 수 있는 프로그램이 없습니다." } : { ok: true, value: { filename: info.filename } };
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

/** 로컬 메일 저장소와 서비스를 준비한다. 실패해도 앱의 다른 기능은 계속 쓸 수 있다. */
function startMail(): void {
  try {
    const dir = path.join(app.getPath("userData"), "mail");
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(path.join(dir, "open-tmp"), { recursive: true, force: true }); // 지난번에 열어 본 첨부의 임시 사본 정리
    const store = new MailStore(path.join(dir, "mail.db"));
    const accounts = new MailAccountStore(path.join(dir, "account.json"), secretStore, getLogger("Mail"));
    const sync = new MailSync({ store, credentials: () => accounts.credentials(), log: getLogger("Mail") });
    mailStore = store;
    mail = new MailService({ accounts, store, sync, log: getLogger("Mail") });
    log.info("[Mail] 로컬 메일 저장소 준비 완료");
  } catch (err) {
    mail = null;
    log.error(`[Mail] 메일 저장소를 준비하지 못했습니다: ${(err as Error).message}`);
  }
}

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

/** 서버 화면이 열려 있을 때만, 그 화면에 "이 대화방을 열어라"고 알린다 (알림을 눌렀을 때). */
function sendOpenConversation(conversationId: number): void {
  if (!win || win.isDestroyed() || !currentIsServerPage()) return;
  win.webContents.send("app:open-conversation", { conversationId });
}

/** 윈도우 시작 시 자동 실행이 켜져 있는가. 설치해서 쓰는 앱(패키지)에서만 의미가 있다. */
function autoStartEnabled(): boolean {
  return app.isPackaged && app.getLoginItemSettings({ args: loginItemSettings(true).args }).openAtLogin;
}

function setAutoStart(enabled: boolean): void {
  app.setLoginItemSettings(loginItemSettings(enabled));
  log.info(`[Main] 윈도우 시작 시 자동 실행: ${enabled ? "켬" : "끔"}`);
  buildTrayMenu(); // 실제 등록 상태를 다시 읽어 메뉴에 반영한다
}

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `BENCH ERP ${VERSION_LABEL}`, enabled: false },
      { type: "separator" },
      { label: "BENCH ERP 열기", click: showWindow },
      { label: "서버 주소 변경", click: () => { showWindow(); showShell("setup"); } },
      {
        label: app.isPackaged ? "윈도우 시작 시 자동 실행" : "윈도우 시작 시 자동 실행 (설치한 앱에서만)",
        type: "checkbox",
        checked: autoStartEnabled(),
        enabled: app.isPackaged,
        click: (item) => setAutoStart(item.checked),
      },
      { type: "separator" },
      { label: "종료", click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip(`BENCH ERP ${VERSION_LABEL}`);
  buildTrayMenu();
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

  // 0) 설치 파일에 들어 있는 기본 서버 주소가 적용되는가 (설치한 앱에서만: 개발 실행에는 없다). 서버에는 접속하지 않는다.
  const bundled = app.isPackaged ? loadDefaultServer(path.join(process.resourcesPath, "default-server.json")) : undefined;
  log.info(`[Smoke] 기본 서버 주소: ${config.serverUrl ?? "(없음)"} / 설치 파일에 든 값: ${bundled ?? "(없음)"}`);
  check("설치 파일의 기본 서버 주소가 처음부터 적용된다 (직원이 입력하지 않아도 됨)", app.isPackaged ? config.serverUrl === bundled : config.serverUrl === undefined);

  // 1) 안내 화면: 통로와 보안
  await new Promise<void>((resolve) => w.webContents.once("did-finish-load", () => resolve()));
  const shellInfo = (await w.webContents.executeJavaScript(`(async () => ({
    bridge: typeof window.benchClient, version: await window.benchClient.getVersion(),
    nfcStatus: (await window.benchClient.nfc.status())?.state ?? null,
    hasRequire: typeof require, hasProcess: typeof process, shellState: (await window.benchClient.shell.state())?.mode,
  }))()`)) as Record<string, unknown>;
  log.info(`[Smoke] 안내 화면: ${JSON.stringify(shellInfo)}`);
  check("안내 화면: 통로 있음, require/process 없음, 버전 표기(V.0.07.150 형식)", shellInfo.bridge === "object" && shellInfo.hasRequire === "undefined" && shellInfo.hasProcess === "undefined" && shellInfo.shellState === "setup" && shellInfo.version === VERSION_LABEL && /^V\.\d+\.\d{2}\.\d{3}$/.test(VERSION_LABEL));
  check("다른 사이트로 이동 차단", !isAllowedNavigation("https://example.com/", config.serverUrl, SHELL_FILE));

  // 1-1) 메일: 저장소(SQLite)가 준비되고, 안내 화면(서버 화면이 아닌 곳)에서는 메일 통로가 아무것도 돌려주지 않는다
  check("메일 로컬 저장소(SQLite)가 준비된다 (설치한 앱에서도 네이티브 모듈이 불러와짐)", mail !== null);
  const shellMail = (await w.webContents.executeJavaScript(`(async () => ({
    account: await window.benchClient.mail.account(), folders: await window.benchClient.mail.folders(),
    save: await window.benchClient.mail.saveAccount({ email: "a@b.co", password: "x" }),
  }))()`)) as { account: unknown; folders: unknown[]; save: { ok: boolean } };
  check("안내 화면에서는 메일 통로가 막혀 있다 (계정·폴더 없음, 저장 거절)", shellMail.account === null && shellMail.folders.length === 0 && shellMail.save.ok === false);

  // 2) 서버 화면(가짜 서버): 팝업·다운로드
  const pageHtml = "<!doctype html><title>smoke</title><body>smoke</body>";
  let registered: { name: string; public_key: string } | null = null;
  let challengeCalls = 0;
  const loginCalls: Record<string, string>[] = [];
  const server = http.createServer((req, res) => {
    if (req.url === "/api/health") res.end('{"status":"ok"}');
    else if (req.method === "POST" && req.url?.startsWith("/api/")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const json = JSON.parse(body) as Record<string, string>;
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/devices/register") {
          registered = json as { name: string; public_key: string };
          res.end('{"status":"pending"}');
        } else if (req.url === "/api/auth/nfc/challenge") {
          challengeCalls++;
          res.end(JSON.stringify({ nonce: "0123456789abcdef0123456789abcdef", expires_in: 60 }));
        } else if (req.url === "/api/auth/nfc/login") {
          loginCalls.push(json);
          const signed = verifySignature(json.public_key, loginMessage(json.nonce, json.uid), json.signature);
          res.statusCode = signed ? 200 : 401;
          res.end(JSON.stringify(signed ? { access_token: "smoke-token" } : { detail: "기기 인증에 실패했습니다." }));
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
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

  // 2-1) 메일: 서버 화면에서는 쓸 수 있고, 접속에 실패하면 계정을 저장하지 않으며, 응답 어디에도 비밀번호가 없다
  const mailProbe = (await w.webContents.executeJavaScript(`(async () => {
    const before = await window.benchClient.mail.account();
    const save = await window.benchClient.mail.saveAccount({ email: "smoke@test.local", password: "SMOKE-SECRET-PW", imapHost: "127.0.0.1", imapPort: 1, smtpHost: "127.0.0.1", smtpPort: 1 });
    const after = await window.benchClient.mail.account();
    const badFolder = await window.benchClient.mail.sync("a" + String.fromCharCode(10) + "b");
    return { before, save, after, badFolder, list: await window.benchClient.mail.list("INBOX", 0, 10) };
  })()`)) as { before: unknown; save: { ok: boolean; error?: string }; after: unknown; badFolder: { ok: boolean }; list: { items: unknown[]; total: number } };
  check("서버 화면: 메일 접속 실패 시 안내 문구를 받고 계정은 저장되지 않는다", mailProbe.before === null && mailProbe.save.ok === false && !!mailProbe.save.error && mailProbe.after === null);
  check("메일 응답에 비밀번호가 없다", !JSON.stringify(mailProbe).includes("SMOKE-SECRET-PW"));
  check("잘못된 폴더 이름은 거절되고 빈 목록은 안전하게 돌려준다", mailProbe.badFolder.ok === false && mailProbe.list.total === 0 && mailProbe.list.items.length === 0);

  // 2-1b) 메일은 별도 창으로 열린다: 한 번만 열리고(다시 누르면 같은 창), 그 창에서도 메일 통로를 쓸 수 있고, 안내 화면에서는 열 수 없다
  const winsBefore = BrowserWindow.getAllWindows().length;
  await w.webContents.executeJavaScript("window.benchClient.mail.openWindow()");
  check("[메일 창] 별도 창이 열린다", await until(() => BrowserWindow.getAllWindows().length === winsBefore + 1));
  const mailWindow = BrowserWindow.getAllWindows().find((x) => x !== w);
  if (mailWindow) {
    check("[메일 창] 서버의 /mail 화면을 불러온다", await until(() => mailWindow.webContents.getURL() === `${config.serverUrl}/mail`));
    await new Promise<void>((resolve) => (mailWindow.webContents.isLoading() ? mailWindow.webContents.once("did-finish-load", () => resolve()) : resolve()));
    const inMailWindow = (await mailWindow.webContents.executeJavaScript(`({ bridge: typeof window.benchClient, mail: typeof window.benchClient?.mail?.account, hasRequire: typeof require })`)) as Record<string, string>;
    check("[메일 창] 메일 통로가 있고 require 는 없다", inMailWindow.bridge === "object" && inMailWindow.mail === "function" && inMailWindow.hasRequire === "undefined");
    await w.webContents.executeJavaScript("window.benchClient.mail.openWindow()");
    await sleep(300);
    check("[메일 창] 다시 눌러도 창이 하나만 있다", BrowserWindow.getAllWindows().length === winsBefore + 1);
    mailWindow.destroy();
  } else {
    check("[메일 창] 열린 창을 찾았다", false);
  }

  // 2-2) 메일 종단 점검 (BENCH_SMOKE_MAIL 이 있을 때만): 암호화(TLS) 접속 + 인증서 검증을 켠 채로 가짜 IMAP 서버와 실제 앱 통로로 읽기까지
  if (process.env.BENCH_SMOKE_MAIL) {
    const cfg = JSON.parse(process.env.BENCH_SMOKE_MAIL) as { host: string; port: number; user: string; pass: string };
    const call = (code: string) => w.webContents.executeJavaScript(code) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const account = (password: string) => JSON.stringify({ email: "e2e@test.local", username: cfg.user, password, imapHost: cfg.host, imapPort: cfg.port, smtpHost: cfg.host, smtpPort: 465 });

    const wrong = await call(`window.benchClient.mail.saveAccount(${account("틀린-비밀번호-E2E")})`);
    check("[메일] 틀린 비밀번호: 로그인 실패로 안내하고 계정은 저장되지 않는다", wrong.ok === false && String(wrong.error).includes("로그인에 실패") && !JSON.stringify(wrong).includes("틀린-비밀번호-E2E") && (await call("window.benchClient.mail.account()")) === null);

    const saved = await call(`window.benchClient.mail.saveAccount(${account(cfg.pass)})`);
    check("[메일] 올바른 비밀번호로 TLS 접속·인증서 검증이 통과하고 계정이 저장된다", saved.ok === true && saved.value.email === "e2e@test.local" && !JSON.stringify(saved).includes(cfg.pass));

    const accFile = path.join(app.getPath("userData"), "mail", "account.json");
    const accRaw = fs.existsSync(accFile) ? fs.readFileSync(accFile, "utf8") : "";
    check("[메일] 비밀번호가 파일에 평문으로 남지 않는다 (OS 암호화 저장)", accRaw.includes("passwordEnc") && !accRaw.includes(cfg.pass));

    const synced = await call(`window.benchClient.mail.sync("INBOX")`);
    check("[메일] 동기화로 서버의 메일을 받아 온다", synced.ok === true && synced.value.added >= 3);

    const listing = await call(`window.benchClient.mail.list("INBOX", 0, 50)`);
    const subjects = (listing.items as { subject: string }[]).map((m) => m.subject);
    check("[메일] 한글 제목이 깨지지 않고 목록에 나온다", subjects.includes("한글 제목 메일") && subjects.includes("스크립트가 든 메일"));
    const folders = await call(`window.benchClient.mail.folders()`);
    check("[메일] 폴더 목록과 안 읽은 수가 나온다", folders.some((f: { path: string; unread: number }) => f.path === "INBOX" && f.unread >= 3));

    const htmlMail = (listing.items as { id: number; subject: string }[]).find((m) => m.subject === "스크립트가 든 메일")!;
    const opened = await call(`window.benchClient.mail.get(${htmlMail.id}, false)`);
    check("[메일] 본문에서 스크립트와 원격 이미지가 걸러지고 차단 사실이 표시된다", opened.ok === true && !/script|alert\(|track\.test/i.test(opened.value.html) && opened.value.remoteImagesBlocked === true && opened.value.html.includes("안녕하세요"));
    const withImages = await call(`window.benchClient.mail.get(${htmlMail.id}, true)`);
    check("[메일] 사용자가 허용하면 이미지가 보이고 스크립트는 여전히 없다", withImages.ok === true && withImages.value.html.includes("track.test") && !/script|alert\(/i.test(withImages.value.html));

    const attMail = (listing.items as { id: number; subject: string }[]).find((m) => m.subject === "첨부 메일")!;
    const withAtt = await call(`window.benchClient.mail.get(${attMail.id}, false)`);
    check("[메일] 첨부 파일 이름(한글)과 크기가 나온다", withAtt.ok === true && withAtt.value.attachments.length === 1 && withAtt.value.attachments[0].filename === "견적서.pdf");

    const after = await call(`window.benchClient.mail.list("INBOX", 0, 50)`);
    check("[메일] 열어 본 메일은 읽음으로 바뀐다", (after.items as { id: number; seen: boolean }[]).filter((m) => m.seen).length >= 2);
  }

  // 3) 카드 모드: login(결과만 전달) / capture(번호 전달) / off(무반응)
  await w.webContents.executeJavaScript(`(() => {
    window.__ev = [];
    window.benchClient.nfc.onLogin((r) => window.__ev.push({ t: "login", r }));
    window.benchClient.nfc.onCard((c) => window.__ev.push({ t: "card", c }));
  })()`);
  const events = () => w.webContents.executeJavaScript("window.__ev") as Promise<{ t: string; r?: { ok: boolean; token?: string }; c?: { uid: string } }[]>;
  const setMode = (m: string) => w.webContents.executeJavaScript(`window.benchClient.nfc.setMode(${JSON.stringify(m)})`);

  await handleCard("0B9F515D");
  await sleep(200);
  check("모드 off: 카드를 대도 아무 일도 없다", (await events()).length === 0 && loginCalls.length === 0 && challengeCalls === 0);

  await setMode("login");
  await handleCard("0B9F515D");
  await until(() => loginCalls.length === 1);
  await sleep(200);
  const evLogin = await events();
  check("모드 login: 앱이 서버에 로그인을 요청하고 화면에는 토큰만 전달", evLogin.length === 1 && evLogin[0].t === "login" && evLogin[0].r?.ok === true && evLogin[0].r?.token === "smoke-token");
  check("login 모드에서는 카드 번호가 화면에 전달되지 않는다", !evLogin.some((e) => e.t === "card") && !JSON.stringify(evLogin).includes("0B9F515D"));
  check("서버가 앱의 서명을 확인했다", loginCalls[0].uid === "0B9F515D" && /^[0-9a-f]{128}$/.test(loginCalls[0].signature));

  await setMode("capture");
  const callsBefore = loginCalls.length;
  await handleCard("0B9F625D");
  await sleep(200);
  const evCapture = await events();
  check("모드 capture: 카드 번호만 전달하고 로그인은 요청하지 않는다", evCapture.at(-1)?.t === "card" && evCapture.at(-1)?.c?.uid === "0B9F625D" && loginCalls.length === callsBefore);

  await w.webContents.executeJavaScript(`window.benchClient.nfc.setMode("hack")`);
  await handleCard("0B9F625D");
  await sleep(200);
  check("알 수 없는 모드는 무시된다 (capture 그대로)", (await events()).filter((e) => e.t === "card").length === 2);

  // 4) 알림을 눌렀을 때: 서버 화면에 "이 대화방을 열어라" 신호 (잘못된 번호는 보내지 않는다)
  await w.webContents.executeJavaScript(`(() => { window.__open = []; window.benchClient.onOpenConversation((p) => window.__open.push(p)); })()`);
  sendOpenConversation(7);
  sendOpenConversation(12);
  await sleep(200);
  check("알림을 누르면 서버 화면에 그 대화방을 열라는 신호가 간다", JSON.stringify(await w.webContents.executeJavaScript("window.__open")) === '[{"conversationId":7},{"conversationId":12}]');
  check("앱은 개발 실행에서는 자동 실행을 등록하지 않는다 (설치한 앱에서만)", !app.isPackaged ? !autoStartEnabled() : true);

  const shellGuard = await w.webContents.executeJavaScript("typeof window.benchClient.nfc.setMode");
  check("setMode 통로가 있다", shellGuard === "function");

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
    try {
      mailStore?.close();
    } catch {
      /* 이미 닫힘 */
    }
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
    if (!config.serverUrl && app.isPackaged) {
      // 설치 파일에 기본 서버 주소가 들어 있으면 처음부터 그 서버로 (저장은 하지 않는다: 직원이 [서버 주소 변경]을 쓰면 그때 저장)
      const preset = loadDefaultServer(path.join(process.resourcesPath, "default-server.json"));
      if (preset) config = { ...config, serverUrl: preset };
    }
    registerIpc();
    startMail();
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
      try {
        await runSmoke();
      } catch (err) {
        log.error(`[Smoke] 점검 중 오류로 중단: ${(err as Error).message}`);
        app.exit(1); // 오류가 나도 창이 남아 멈추지 않게 한다
      }
    } else {
      await openServer();
      if (HIDDEN_START && !config.serverUrl) showWindow(); // 서버 주소를 아직 모르면 입력받아야 하므로 창을 띄운다
      void refreshDevice();
      deviceTimer = setInterval(() => void refreshDevice(), 60_000);
    }
  });
}
