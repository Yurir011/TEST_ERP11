/**
 * BENCH ERP 데스크톱 클라이언트 (Electron main).
 * 화면은 설정된 서버(사내 ERP)에서 그대로 불러오고, 이 앱은 PC 기능(NFC 리더, 트레이, 알림)만 맡는다.
 *
 * 실행 옵션: --smoke  창을 띄워 보안 설정과 화면 연결 통로만 확인하고 곧바로 종료한다 (종료 코드 0 = 정상).
 */
import fs from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, nativeImage, powerMonitor, safeStorage, screen, session, shell } from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { ImapFlow } from "imapflow";

import { type DeviceKey, type DeviceStatusName, type SecretStore, defaultDeviceName, loadOrCreateDeviceKey, registerDevice, verifySignature } from "./device";
import { getLogger } from "./log";
import { MailAccountStore } from "./mail/account";
import { parseAttachmentIndex, parseContactInput, parseDocumentCompose, parseDraftKind, parseFilter, parseFolderPath, parseMailId, parseMailIds, parsePaging, parseSendPayload } from "./mail/args";
import { MailComposer, type StagedAttachment } from "./mail/compose";
import { IdentityStore, parseIdentitySettings } from "./mail/identities";
import { formatNewMailNotice } from "./mail/notify";
import { MailPoller, type PollResult, resolvePollInterval } from "./mail/poller";
import { MailSender } from "./mail/send";
import { MailService, isDangerousFilename, safeFilename } from "./mail/service";
import { MailStore } from "./mail/store";
import { MAIN_SLOT, SlotRegistry, deleteSlotFiles, isSlotId, slotPaths } from "./mail/slots";
import { MailSync } from "./mail/sync";
import { loginMessage, performNfcLogin } from "./nfcLogin";
import { serialPortProvider } from "./nfc/port";
import { NfcReader, type NfcStatus } from "./nfc/reader";
import { INSTALLER_ARGS, checkForUpdate, describeUpdate, downloadInstaller } from "./updater";
import { DEFAULT_ZOOM, stepZoom, zoomKeyAction } from "./zoom";
import { isVisibleOnAnyDisplay } from "./windowPlacement";
import { type AppConfig, checkHealth, classifySender, decideWindowOpen, isAllowedNavigation, loadConfig, loadDefaultServer, normalizeServerUrl, saveConfig } from "./serverConfig";
import { badgeImageName, badgeSummary, clampBadgeCount, combinedBadgeCount, loginItemSettings, parseConversationId, startsHidden, UPDATED_FLAG } from "./startup";
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
let loggedOutOnQuit = false;
const UPDATE_LOCK_WAIT_MS = 500;
const UPDATE_LOCK_RETRIES = 40; // 최대 20초
/** 앱 업데이트를 진행 중이면 true (다시 눌러도 한 번만 하고, 끝날 때 로그아웃하지 않는다) */
let updating = false;
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
let composer: MailComposer | null = null;
let identities: IdentityStore | null = null;
/**
 * 메일 계정마다 받은 메일 저장소·서비스·새 메일 확인이 따로 있다 (메일함이 서로 섞이지 않는다).
 * 위의 mail / composer / identities 는 지금 메일 창에서 보고 있는 계정의 것을 가리킨다.
 */
interface MailRuntime {
  id: string;
  accounts: MailAccountStore;
  store: MailStore;
  service: MailService;
  composer: MailComposer;
  identities: IdentityStore;
  poller: MailPoller;
}
const mailRuntimes = new Map<string, MailRuntime>();
let mailSlots: SlotRegistry | null = null;
let mailDir = "";
let activeMailId = MAIN_SLOT;
/** 계정별 받은메일함 안 읽은 수 (배지·사이드바 숫자는 이 합계) */
const unreadByMail = new Map<string, number>();
/** 작업 표시줄 배지는 메신저 안 읽은 수와 메일 안 읽은 수를 합쳐 하나로 보여 준다 */
let badgeMessenger = 0;
let badgeMail = 0;
/** 알림을 눌러 메일 창을 여는 중이면 열어야 할 메일 (어느 계정의 몇 번 메일인지. 창의 화면이 준비되면 가져간다) */
let pendingOpenMessage: { accountId: string; id: number } | null = null;
/** ERP 문서 화면에서 "메일 보내기"로 넘어온 작성 초안 (메일 창의 화면이 준비되면 한 번만 가져간다) */
interface PendingCompose {
  draft: { to: string; cc: string; subject: string; body: string; attachments: StagedAttachment[] };
  doc: { type: "project_document"; id: number };
  /** 이 초안을 쓸 메일 계정 */
  accountId: string;
}
let pendingCompose: PendingCompose | null = null;
/** 새 메일 알림을 띄우는 통로. 점검(smoke)에서는 진짜 알림 대신 기록만 하도록 바꿔 끼운다 */
let showMailNotification: (title: string, body: string, onClick: () => void) => void = (title, body, onClick) => {
  const n = new Notification({ title, body, icon: ICON });
  n.on("click", onClick);
  n.show();
};

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

  // 브라우저처럼 Ctrl + / Ctrl - / Ctrl 0 으로 화면 확대·축소 (모든 창에 같은 배율, 다음 실행에도 유지)
  wc.on("before-input-event", (event, input) => {
    const action = zoomKeyAction(input);
    if (!action) return;
    event.preventDefault();
    setZoom(stepZoom(config.zoomFactor ?? DEFAULT_ZOOM, action));
  });
  wc.on("did-finish-load", () => wc.setZoomFactor(config.zoomFactor ?? DEFAULT_ZOOM));
}

function setZoom(factor: number): void {
  config = { ...config, zoomFactor: factor === DEFAULT_ZOOM ? undefined : factor };
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.setZoomFactor(factor);
  log.debug(`[Main] 화면 배율: ${Math.round(factor * 100)}%`);
  if (!SMOKE) {
    try {
      saveConfig(configFile(), config);
    } catch (err) {
      log.warn(`[Main] 화면 배율을 저장하지 못했습니다: ${(err as Error).message}`);
    }
  }
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
  w.on("close", () => {
    if (quitting || SMOKE) return;
    log.info("[Main] 창의 X 로 닫음 → 앱을 종료합니다");
    app.quit(); // X 를 누르면 트레이에 남지 않고 앱이 완전히 끝난다 (before-quit 에서 로그아웃 후 종료)
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

const cleanExitFile = (): string => path.join(app.getPath("userData"), "clean-exit");

/**
 * 앱이 정상 종료(로그아웃까지 끝남)하지 않고 꺼졌다면(PC 종료·로그오프·강제 종료·정전) 로그인 정보가 남아 있을 수 있다.
 * 윈도우는 PC 를 끌 때 앱의 종료 처리를 기다려 주지 않기 때문에, 다음 실행 때 서버 화면을 열기 전에 로그인 정보를 지운다.
 */
async function logoutIfNotCleanExit(): Promise<void> {
  if (!config.serverUrl) return;
  const marker = cleanExitFile();
  const clean = fs.existsSync(marker);
  fs.rmSync(marker, { force: true });
  if (clean) return;
  try {
    await session.defaultSession.clearStorageData({ origin: config.serverUrl, storages: ["localstorage"] });
    await session.defaultSession.flushStorageData();
    log.info("[Main] 정상 종료가 아니어서(PC 종료 등) 시작할 때 ERP 로그인 정보를 지웠습니다");
  } catch (err) {
    log.warn(`[Main] 시작 시 로그인 정보 삭제 실패: ${(err as Error).message}`);
  }
}

/** ERP 로그인 정보(토큰)를 지운다. 창이 서버 화면이면 그 화면의 저장소에서 지우고, 아니면 서버 주소의 저장소를 비운다. 몇 초 안에 끝나지 않으면 포기한다 */
async function logoutOnQuit(): Promise<void> {
  const work = (async () => {
    if (!config.serverUrl) return;
    const wins = BrowserWindow.getAllWindows().filter((x) => !x.isDestroyed() && classifySender(x.webContents.getURL(), config.serverUrl, SHELL_FILE) === "server");
    if (wins.length > 0) {
      await wins[0].webContents.executeJavaScript(`localStorage.removeItem("erp_access_token")`); // 같은 서버 화면은 저장소를 함께 쓰므로 한 번이면 된다
    } else {
      await session.defaultSession.clearStorageData({ origin: config.serverUrl, storages: ["localstorage"] });
    }
    await session.defaultSession.flushStorageData();
    fs.writeFileSync(cleanExitFile(), String(Date.now())); // "정상 종료 + 로그아웃 끝남" 표시 (다음 실행 때 확인한다)
    log.info("[Main] 앱 종료: ERP 로그아웃(로그인 정보 삭제) 완료");
  })();
  await Promise.race([work.catch((err: Error) => log.warn(`[Main] 종료 시 로그아웃 실패: ${err.message}`)), new Promise<void>((r) => setTimeout(r, 3000))]);
}

function startNfc(): void {
  reader = new NfcReader(serialPortProvider({ preferred: config.nfcPort, log: getLogger("NFC") }), { log: getLogger("NFC") });
  reader.on("status", (s: NfcStatus) => {
    if (win && !win.isDestroyed()) win.webContents.send("nfc:status", s);
  });
  reader.on("card", (t: { uid: string }) => void handleCard(t.uid));
  reader.start();

  // PC 가 절전(대기) 모드로 들어가면 USB 전원이 꺼져 리더 포트가 끊긴다. 들어가기 전에 포트를 깨끗이 닫고, 깨어난 뒤 잠시(USB 가 다시 잡히도록) 기다렸다가 다시 연결한다.
  let stopping: Promise<void> = Promise.resolve();
  powerMonitor.on("suspend", () => {
    log.info("[NFC] 절전 모드 진입: 리더 연결을 닫습니다");
    stopping = reader?.stop() ?? Promise.resolve();
  });
  powerMonitor.on("resume", () => {
    log.info("[NFC] 절전 모드에서 깨어남: 잠시 뒤 리더를 다시 연결합니다");
    setTimeout(() => {
      void stopping.then(() => reader?.start());
    }, 3000);
  });
}

/** 작업 표시줄·트레이 배지를 메신저+메일 합계로 새로 그린다 */
function applyBadge(): void {
  // 웹 화면(서버)이 사이드바에 보여 줄 안 읽은 메일 수를 알 수 있게 ERP 창에 알려 준다
  if (win && !win.isDestroyed()) win.webContents.send("mail:unread", { unread: badgeMail });
  const total = combinedBadgeCount(badgeMessenger, badgeMail);
  const summary = badgeSummary(badgeMessenger, badgeMail);
  app.setBadgeCount(total); // macOS/Linux
  tray?.setToolTip(summary ? `BENCH ERP ${VERSION_LABEL} (${summary})` : `BENCH ERP ${VERSION_LABEL}`);
  if (process.platform === "win32" && win && !win.isDestroyed()) {
    const name = badgeImageName(total);
    win.setOverlayIcon(name ? nativeImage.createFromPath(path.join(BADGE_DIR, name)) : null, summary);
  }
}

/** 지금 메일 창에서 보는 계정으로 바꾼다 (이후 mail / composer / identities 는 그 계정의 것) */
function activateMail(id: string): MailRuntime | null {
  const rt = mailRuntimes.get(id);
  if (!rt) return null;
  activeMailId = id;
  mail = rt.service;
  composer = rt.composer;
  identities = rt.identities;
  return rt;
}

/** 계정이 등록되어 있는 칸들 (받은메일함이 따로 있는 계정) */
function configuredMail(): MailRuntime[] {
  return [...mailRuntimes.values()].filter((rt) => rt.service.accountInfo() !== null);
}

/** 이 PC 에 받아 둔 모든 계정의 받은메일함 안 읽은 수로 메일 배지를 다시 계산한다 (읽음 표시·이동·삭제 뒤에 부른다) */
function refreshMailBadge(): void {
  unreadByMail.clear();
  let total = 0;
  for (const rt of configuredMail()) {
    const n = rt.service.inboxUnread();
    unreadByMail.set(rt.id, n);
    total += n;
  }
  badgeMail = total;
  applyBadge();
}

/** 알림을 눌렀을 때 메일 창을 열고(이미 열려 있으면 앞으로) 해당 계정의 메일로 이동하게 한다. id 가 없으면 메일 창만 연다 */
function openMessageInMailWindow(accountId: string, id: number | null): void {
  pendingOpenMessage = id === null ? null : { accountId, id };
  openMailWindow();
  if (id === null || !mailWin || mailWin.isDestroyed() || mailWin.webContents.isLoading()) return; // 아직 불러오는 중이면 화면이 준비된 뒤 가져간다
  mailWin.webContents.send("mail:open-message", { id, accountId });
  pendingOpenMessage = null;
}

/** 문서 화면에서 넘어온 작성 초안으로 메일 창을 열고(이미 열려 있으면 앞으로) 쓰기 화면을 띄운다 */
function openComposeInMailWindow(p: PendingCompose): void {
  pendingCompose = p;
  openMailWindow();
  if (!mailWin || mailWin.isDestroyed() || mailWin.webContents.isLoading()) return; // 아직 불러오는 중이면 화면이 준비된 뒤 가져간다
  mailWin.webContents.send("mail:open-compose");
}

/** 새 메일 확인 결과: 배지 갱신, 열려 있는 메일 창 새로 읽기, 새 메일 알림 */
function handlePollResult(rt: MailRuntime, r: PollResult): void {
  unreadByMail.set(rt.id, r.unread);
  badgeMail = [...unreadByMail.values()].reduce((sum, n) => sum + n, 0);
  applyBadge();
  const window = mailWin && !mailWin.isDestroyed() ? mailWin : null;
  if (r.changed && window) window.webContents.send("mail:changed", { accountId: rt.id });
  // 계정이 둘 이상이면 어느 계정으로 온 메일인지 알려 준다
  const email = configuredMail().length > 1 ? (rt.service.accountInfo()?.email ?? "") : "";
  // ERP 창 사이드바에 새 메일(보낸 사람·제목)을 보여 줄 수 있게 알린다 (메일 내용은 이 PC 안에서만 오간다)
  if (r.newMail.length > 0 && win && !win.isDestroyed()) win.webContents.send("mail:new", r.newMail.map((m) => ({ id: m.id, from: m.from, subject: m.subject, accountId: rt.id, account: email || undefined })));
  const notice = formatNewMailNotice(r.newMail);
  if (!notice) return;
  if (window && window.isFocused() && activeMailId === rt.id) return; // 지금 이 계정의 메일 창을 보고 있으면 따로 알리지 않는다 (목록에 바로 나타난다)
  log.info(`[Mail] 새 메일 알림: ${r.newMail.length}통 (계정 ${rt.id})`);
  const only = r.newMail.length === 1 ? r.newMail[0].id : null;
  showMailNotification(email ? `${notice.title} (${email})` : notice.title, notice.body, () => openMessageInMailWindow(rt.id, only));
  if (win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true);
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
    badgeMessenger = clampBadgeCount(count);
    applyBadge();
  });

  // ---- 메일 (서버 화면에서만. 비밀번호는 저장할 때 한 번 들어오고, 어떤 응답에도 담기지 않는다) ----
  const MAIL_UNAVAILABLE = { ok: false as const, error: "메일 기능을 시작하지 못했습니다. 앱을 다시 실행해 주세요." };

  // ---- 메일 쓰기·보내기 (서버 화면에서만) ----
  ipcMain.handle("mail:compose-draft", async (e, kind: unknown, id: unknown) => {
    if (!guard(e, "mail:compose-draft", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const k = parseDraftKind(kind);
    if (!k) return { ok: false, error: "요청이 올바르지 않습니다." };
    const n = id === undefined || id === null ? undefined : (parseMailId(id) ?? -1);
    if (n === -1) return { ok: false, error: "메일 번호가 올바르지 않습니다." };
    return composer ? composer.draft(k, n) : MAIL_UNAVAILABLE;
  });

  /** 첨부할 파일 고르기: 파일 선택 창은 앱이 띄우고, 화면에는 파일 경로가 아니라 준비된 첨부의 번호·이름·크기만 준다 */
  ipcMain.handle("mail:pick-attachments", async (e) => {
    if (!guard(e, "mail:pick-attachments", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    if (!composer) return MAIL_UNAVAILABLE;
    const owner = BrowserWindow.fromWebContents(e.sender);
    const picked = owner ? await dialog.showOpenDialog(owner, { title: "첨부할 파일 선택", properties: ["openFile", "multiSelections"] }) : { canceled: true, filePaths: [] as string[] };
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: "취소했습니다.", canceled: true };
    return composer.stageFiles(picked.filePaths);
  });

  ipcMain.handle("mail:discard-attachments", (e, ids: unknown) => {
    if (!guard(e, "mail:discard-attachments", ["server"])) return;
    if (Array.isArray(ids) && ids.length <= 50 && ids.every((x) => typeof x === "string" && x.length <= 64)) composer?.discard(ids as string[]);
  });

  ipcMain.handle("mail:send", async (e, payload: unknown) => {
    if (!guard(e, "mail:send", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const p = parseSendPayload(payload);
    if (!p) return { ok: false, error: "보낼 내용의 형식이 올바르지 않습니다." };
    return composer ? composer.send(p) : MAIL_UNAVAILABLE;
  });


  // ---- 이동·삭제·스팸 신고·서버 본문 검색·알림으로 연 메일 (서버 화면에서만) ----
  ipcMain.handle("mail:move", async (e, ids: unknown, dest: unknown) => {
    if (!guard(e, "mail:move", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const list = parseMailIds(ids);
    const folder = parseFolderPath(dest);
    if (!list || !folder) return { ok: false, error: "요청이 올바르지 않습니다." };
    if (!mail) return MAIL_UNAVAILABLE;
    const r = await mail.move(list, folder);
    refreshMailBadge();
    return r;
  });

  ipcMain.handle("mail:remove", async (e, ids: unknown, permanent: unknown) => {
    if (!guard(e, "mail:remove", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const list = parseMailIds(ids);
    if (!list) return { ok: false, error: "요청이 올바르지 않습니다." };
    if (!mail) return MAIL_UNAVAILABLE;
    const r = await mail.remove(list, permanent === true);
    refreshMailBadge();
    return r;
  });

  ipcMain.handle("mail:spam", async (e, ids: unknown) => {
    if (!guard(e, "mail:spam", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const list = parseMailIds(ids);
    if (!list) return { ok: false, error: "요청이 올바르지 않습니다." };
    if (!mail) return MAIL_UNAVAILABLE;
    const r = await mail.spam(list);
    refreshMailBadge();
    return r;
  });

  ipcMain.handle("mail:search-body", async (e, folder: unknown, query: unknown) => {
    if (!guard(e, "mail:search-body", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const f = parseFolderPath(folder);
    if (!f || typeof query !== "string" || query.length > 200) return { ok: false, error: "검색어가 올바르지 않습니다." };
    return mail ? mail.searchBody(f, query) : MAIL_UNAVAILABLE;
  });

  /** ERP 문서(PDF)를 첨부한 메일 쓰기 화면을 메일 창에서 연다. 보내는 쪽은 서버 화면의 문서 상세 */
  ipcMain.handle("mail:compose-document", (e, payload: unknown) => {
    if (!guard(e, "mail:compose-document", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const req = parseDocumentCompose(payload);
    if (!req) return { ok: false, error: "문서 정보가 올바르지 않습니다." };
    if (!composer || !mail) return MAIL_UNAVAILABLE;
    // 지금 메일 창에서 보던 계정으로 쓰고, 그 계정이 등록되어 있지 않으면 등록된 첫 계정으로 쓴다
    const target = configuredMail().find((x) => x.id === activeMailId) ?? configuredMail()[0];
    if (!target) return { ok: false, error: "메일 계정이 등록되어 있지 않습니다. 메일 창에서 먼저 계정을 설정해 주세요.", needsAccount: true };
    activateMail(target.id);
    const staged = target.composer.stageDocument(req.filename, req.data);
    if (!staged.ok) return staged;
    // 이전에 가져가지 않은 초안이 있으면 그 첨부는 버린다
    if (pendingCompose) target.composer.discard(pendingCompose.draft.attachments.map((a) => a.id));
    openComposeInMailWindow({ draft: { to: req.to, cc: "", subject: req.subject, body: req.body, attachments: [staged.value] }, doc: req.doc, accountId: target.id });
    return { ok: true, value: null };
  });

  ipcMain.handle("mail:consume-pending-compose", (e) => {
    if (!guard(e, "mail:consume-pending-compose", ["server"])) return null;
    const p = pendingCompose;
    pendingCompose = null;
    return p;
  });

  // 안 읽은 메일 수: 등록된 모든 계정의 받은메일함 합계 (계정이 하나도 없으면 null)
  ipcMain.handle("mail:unread", (e) => {
    if (!guard(e, "mail:unread", ["server"])) return null;
    const list = configuredMail();
    return list.length === 0 ? null : list.reduce((sum, rt) => sum + rt.service.inboxUnread(), 0);
  });

  /** 알림을 눌러 메일 창이 새로 열린 경우, 화면이 준비된 뒤 열어야 할 메일 번호를 한 번만 알려 준다 */
  ipcMain.handle("mail:consume-pending-open", (e) => {
    if (!guard(e, "mail:consume-pending-open", ["server"])) return null;
    const pending = pendingOpenMessage;
    pendingOpenMessage = null;
    return pending;
  });


  /** ERP 사이드바의 새 메일 알림을 눌렀을 때: 메일 창을 열고 그 메일로 이동 */
  ipcMain.handle("mail:open-message-window", (e, id: unknown, accountId?: unknown) => {
    if (!guard(e, "mail:open-message-window", ["server"])) return;
    const n = parseMailId(id);
    const account = isSlotId(accountId) && mailRuntimes.has(accountId) ? accountId : activeMailId;
    if (n !== null) openMessageInMailWindow(account, n);
  });

  /** 메일 창에서 ERP 메인 창으로 돌아가기 */
  ipcMain.handle("app:focus-main", (e) => {
    if (!guard(e, "app:focus-main", ["server"])) return;
    showWindow();
  });

  ipcMain.handle("mail:open-window", (e) => {
    if (!guard(e, "mail:open-window", ["server"])) return;
    openMailWindow();
  });

  // 보내는 사람 목록(쓰기 화면에서 고르는 이름·주소): 읽기와 저장
  const NO_IDENTITIES = { items: [], defaultAddress: "" };
  ipcMain.handle("mail:identities", (e) => (guard(e, "mail:identities", ["server"]) ? (identities?.load() ?? NO_IDENTITIES) : NO_IDENTITIES));
  ipcMain.handle("mail:identities-save", (e, input: unknown) => {
    if (!guard(e, "mail:identities-save", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    if (!identities) return MAIL_UNAVAILABLE;
    const parsed = parseIdentitySettings(input);
    if (!parsed.ok) return parsed;
    identities.save(parsed.value);
    log.info(`[Mail] 보내는 사람 목록 저장: ${parsed.value.items.length}개`);
    return { ok: true, value: parsed.value };
  });

  // 주소록(받는 사람 자동완성): 목록 읽기와 지우기
  ipcMain.handle("mail:contacts", (e, query: unknown, limit: unknown) => {
    if (!guard(e, "mail:contacts", ["server"]) || !mail) return [];
    const q = typeof query === "string" && query.length <= 200 ? query : "";
    const n = typeof limit === "number" && Number.isFinite(limit) ? Math.trunc(limit) : 8;
    return mail.contacts(q, n);
  });
  ipcMain.handle("mail:addressbook", (e, query: unknown) => {
    if (!guard(e, "mail:addressbook", ["server"]) || !mail) return [];
    return mail.addressBook(typeof query === "string" && query.length <= 200 ? query : "");
  });
  ipcMain.handle("mail:contact-save", (e, input: unknown) => {
    if (!guard(e, "mail:contact-save", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    const parsed = parseContactInput(input);
    if (!parsed) return { ok: false, error: "연락처 형식이 올바르지 않습니다." };
    return mail ? mail.saveContact(parsed) : MAIL_UNAVAILABLE;
  });
  ipcMain.handle("mail:contact-remove", (e, address: unknown) => {
    if (!guard(e, "mail:contact-remove", ["server"]) || !mail) return false;
    return typeof address === "string" && address.length <= 254 ? mail.removeContact(address) : false;
  });

  // ---- 앱 업데이트 (서버 화면에서만. 주소·파일 이름은 화면이 정하지 못한다) ----
  ipcMain.handle("update:check", async (e) => {
    if (!guard(e, "update:check", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    if (!config.serverUrl) return { ok: false, error: "서버 주소가 설정되어 있지 않습니다." };
    return checkForUpdate(config.serverUrl, app.getVersion());
  });

  ipcMain.handle("update:install", async (e) => {
    if (!guard(e, "update:install", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    if (!config.serverUrl) return { ok: false, error: "서버 주소가 설정되어 있지 않습니다." };
    if (process.platform !== "win32" || !app.isPackaged) return { ok: false, error: "설치해서 쓰는 Windows 앱에서만 바로 업데이트할 수 있습니다." };
    if (updating) return { ok: false, error: "이미 업데이트를 진행 중입니다." };
    updating = true;
    try {
      const info = await checkForUpdate(config.serverUrl, app.getVersion());
      if (!info.ok) return info;
      if (!info.latest || !info.newer) return { ok: false, error: "이미 최신 버전입니다." };
      log.info(`[Update] 업데이트 시작: ${app.getVersion()} → ${describeUpdate(info.latest)}`);
      const dir = path.join(app.getPath("temp"), "bench-update");
      const done = await downloadInstaller(config.serverUrl, info.latest, dir, (ratio) => {
        if (!e.sender.isDestroyed()) e.sender.send("update:progress", { ratio });
      }, fetch, log);
      if (!done.ok) {
        updating = false;
        return done;
      }
      // 업데이트로 끝나는 것이므로 로그인은 유지한다 (정상 종료 표시를 남겨 다음 실행 때 로그인 정보를 지우지 않게)
      fs.writeFileSync(cleanExitFile(), String(Date.now()));
      const child = spawn(done.file, [...INSTALLER_ARGS], { detached: true, stdio: "ignore" });
      child.on("error", (err) => {
        log.error(`[Update] 설치 프로그램을 실행하지 못했습니다: ${err.message}`);
        updating = false;
      });
      child.unref();
      log.info("[Update] 설치 프로그램 실행: 앱을 종료합니다");
      setTimeout(() => {
        quitting = true;
        app.quit();
        // 종료가 어떤 이유로 끝나지 않아도 이전 앱이 남아 새 앱을 막지 않게, 잠시 뒤 확실히 끝낸다
        setTimeout(() => app.exit(0), 4000).unref();
      }, 800);
      return { ok: true, value: { display: info.latest.display } };
    } catch (err) {
      updating = false;
      log.error(`[Update] 업데이트 실패: ${(err as Error).message}`);
      return { ok: false, error: "업데이트하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
    }
  });

  ipcMain.handle("mail:account", (e) => (guard(e, "mail:account", ["server"]) ? (mail?.accountInfo() ?? null) : null));

  ipcMain.handle("mail:account-save", async (e, input: unknown) => {
    if (!guard(e, "mail:account-save", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    if (!mail) return MAIL_UNAVAILABLE;
    const r = await mail.saveAccount(input);
    if (r.ok) refreshMailBadge();
    return r;
  });

  // 계정 지우기: 처음 쓰던 칸이 아닌 계정은 그 칸의 받은 메일·설정 파일까지 함께 지운다
  ipcMain.handle("mail:account-remove", (e) => {
    if (!guard(e, "mail:account-remove", ["server"])) return;
    mail?.removeAccount();
    if (activeMailId !== MAIN_SLOT) dropMailSlot(activeMailId);
    refreshMailBadge();
  });

  /** 등록된 메일 계정 목록(이메일·안 읽은 수)과 지금 보고 있는 계정 */
  ipcMain.handle("mail:accounts", (e) => {
    if (!guard(e, "mail:accounts", ["server"])) return { accounts: [], active: MAIN_SLOT };
    refreshMailBadge();
    return { accounts: configuredMail().map((rt) => ({ id: rt.id, email: rt.service.accountInfo()!.email, unread: unreadByMail.get(rt.id) ?? 0 })), active: activeMailId };
  });

  /** 메일 창에서 볼 계정을 바꾼다. 이후 목록·본문·쓰기는 그 계정의 메일함에서 이루어진다 */
  ipcMain.handle("mail:use-account", (e, id: unknown) => {
    if (!guard(e, "mail:use-account", ["server"]) || !isSlotId(id)) return null;
    const rt = activateMail(id);
    return rt ? rt.service.accountInfo() : null;
  });

  /** 새 메일 계정을 등록할 칸을 준비하고 그 칸으로 바꾼다 (비어 있는 칸이 있으면 그것을 쓴다) */
  ipcMain.handle("mail:new-slot", (e) => {
    if (!guard(e, "mail:new-slot", ["server"])) return null;
    return addMailSlot();
  });

  /** 등록하지 않고 끝낸 빈 칸을 치운다 */
  ipcMain.handle("mail:drop-slot", (e, id: unknown) => {
    if (!guard(e, "mail:drop-slot", ["server"]) || !isSlotId(id)) return;
    const rt = mailRuntimes.get(id);
    if (!rt || rt.service.accountInfo() !== null) return; // 등록된 계정이 있는 칸은 여기서 지우지 않는다
    dropMailSlot(id);
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
    if (!mail) return MAIL_UNAVAILABLE;
    const result = await mail.get(n, { allowRemoteImages: allowRemoteImages === true });
    refreshMailBadge(); // 메일을 열면 읽음으로 바뀐다
    return result;
  });

  ipcMain.handle("mail:set-flagged", async (e, id: unknown, flagged: unknown) => {
    if (!guard(e, "mail:set-flagged", ["server"])) return;
    const n = parseMailId(id);
    if (n && mail && typeof flagged === "boolean") await mail.setFlagged(n, flagged);
  });

  ipcMain.handle("mail:mark-seen", async (e, id: unknown, seen: unknown) => {
    if (!guard(e, "mail:mark-seen", ["server"])) return;
    const n = parseMailId(id);
    if (n && mail && typeof seen === "boolean") {
      await mail.markSeen(n, seen);
      refreshMailBadge();
    }
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

  /** ERP 첨부파일 열기: 화면이 받은 파일 내용을 임시 폴더에 풀어 기본 프로그램으로 연다. 실행 파일 종류는 열지 않고, 크기도 제한한다. */
  ipcMain.handle("file:open", async (e, filename: unknown, data: unknown) => {
    if (!guard(e, "file:open", ["server"])) return { ok: false, error: "허용되지 않은 요청입니다." };
    if (typeof filename !== "string" || !filename.trim()) return { ok: false, error: "파일 이름이 올바르지 않습니다." };
    const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : null;
    if (!bytes || bytes.length === 0) return { ok: false, error: "파일 내용이 비어 있습니다." };
    if (bytes.length > 100 * 1024 * 1024) return { ok: false, error: "파일이 너무 커서 열 수 없습니다." };
    if (isDangerousFilename(filename)) return { ok: false, error: "프로그램을 실행하는 파일은 열 수 없습니다." };
    const dir = path.join(app.getPath("userData"), "open-tmp", String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, safeFilename(filename));
    fs.writeFileSync(file, bytes);
    log.info(`[File] 첨부파일 열기: ${safeFilename(filename)} (${bytes.length}바이트)`);
    const err = await shell.openPath(file);
    return err ? { ok: false, error: "이 파일을 열 수 있는 프로그램이 없습니다." } : { ok: true };
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

/** 메일 계정 한 칸의 저장소·서비스·새 메일 확인을 만든다 (계정마다 파일이 따로다) */
function createMailRuntime(dir: string, id: string): MailRuntime {
  const p = slotPaths(dir, id);
  const logger = getLogger("Mail");
  const store = new MailStore(p.db);
  const accounts = new MailAccountStore(p.account, secretStore, logger);
  const sync = new MailSync({ store, credentials: () => accounts.credentials(), log: logger });
  const identitiesStore = new IdentityStore(p.identities, logger);
  const service = new MailService({ accounts, store, sync, log: logger });
  const sender = new MailSender({ credentials: () => accounts.credentials(), log: logger });
  const composerObj = new MailComposer({ accounts, store, sync, sender, tempDir: path.join(dir, "compose-tmp"), log: logger });
  const poller = new MailPoller({
    poll: () => service.pollInbox(),
    onResult: (r) => handlePollResult(rt, r),
    intervalMs: resolvePollInterval(process.env.BENCH_MAIL_POLL_MS),
    log: logger,
  });
  const rt: MailRuntime = { id, accounts, store, service, composer: composerObj, identities: identitiesStore, poller };
  return rt;
}

/** 새 계정을 등록할 칸을 준비하고 그 칸으로 바꾼다. 비어 있는(계정이 없는) 칸이 있으면 그것을 쓴다. */
function addMailSlot(): string | null {
  if (!mailSlots || !mailDir) return null;
  const empty = [...mailRuntimes.values()].find((rt) => rt.service.accountInfo() === null);
  if (empty) {
    activateMail(empty.id);
    return empty.id;
  }
  const id = mailSlots.add();
  const rt = createMailRuntime(mailDir, id);
  mailRuntimes.set(id, rt);
  if (!SMOKE) rt.poller.start();
  activateMail(id);
  log.info(`[Mail] 새 계정 칸 준비: ${id}`);
  return id;
}

/** 계정 칸을 치운다 (그 칸의 받은 메일·설정 파일까지). 처음 쓰던 칸은 남기고, 보던 계정이 사라지면 다른 계정으로 바꾼다. */
function dropMailSlot(id: string): void {
  if (id === MAIN_SLOT || !mailSlots) return;
  const rt = mailRuntimes.get(id);
  if (!rt) return;
  rt.poller.stop();
  try {
    rt.store.close();
  } catch {
    /* 이미 닫힘 */
  }
  mailRuntimes.delete(id);
  unreadByMail.delete(id);
  mailSlots.remove(id);
  deleteSlotFiles(mailDir, id);
  log.info(`[Mail] 계정 칸 삭제: ${id}`);
  if (activeMailId === id) activateMail(configuredMail()[0]?.id ?? MAIN_SLOT);
}

/** 로컬 메일 저장소와 서비스를 준비한다. 실패해도 앱의 다른 기능은 계속 쓸 수 있다. */
function startMail(): void {
  try {
    const dir = path.join(app.getPath("userData"), "mail");
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(path.join(dir, "open-tmp"), { recursive: true, force: true }); // 지난번에 열어 본 첨부의 임시 사본 정리
    fs.rmSync(path.join(dir, "compose-tmp"), { recursive: true, force: true }); // 보내다 만 메일의 전달용 첨부 임시 사본 정리
    mailDir = dir;
    mailSlots = new SlotRegistry(path.join(dir, "accounts.json"));
    for (const id of mailSlots.ids()) mailRuntimes.set(id, createMailRuntime(dir, id));
    activateMail(configuredMail()[0]?.id ?? MAIN_SLOT);
    log.info(`[Mail] 로컬 메일 저장소 준비 완료 (계정 칸 ${mailRuntimes.size}개, 등록된 계정 ${configuredMail().length}개)`);
    refreshMailBadge(); // 이전에 받아 둔 안 읽은 메일 수를 배지에 바로 반영
    if (!SMOKE) for (const rt of mailRuntimes.values()) rt.poller.start(); // 점검(smoke)에서는 시간에 맞춘 자동 확인 대신 직접 부른다
  } catch (err) {
    mailRuntimes.clear();
    mail = null;
    composer = null;
    identities = null;
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

/**
 * 앱 창을 앞으로 가져온다 (바로가기를 다시 누르거나 트레이를 눌렀을 때).
 * 최소화돼 있으면 되살리고, 모니터를 뺀 뒤 화면 밖에 남은 창은 가운데로 옮기며,
 * 다른 프로그램이 앞에 있어도 윈도우가 막지 못하도록 잠깐 맨 위로 올렸다가 내린다.
 */
function showWindow(): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!isVisibleOnAnyDisplay(win.getBounds(), screen.getAllDisplays().map((d) => d.workArea))) {
    log.info("[Main] 창이 화면 밖에 있어 가운데로 옮깁니다");
    win.center();
  }
  win.show();
  win.setAlwaysOnTop(true); // 윈도우는 뒤에 있던 프로그램이 스스로 앞으로 나오는 것을 막으므로, 맨 위로 올린 뒤 바로 내린다
  win.focus();
  win.setAlwaysOnTop(false);
  app.focus({ steal: true });
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
    send: await window.benchClient.mail.send({ fromName: "x", to: "a@b.co", cc: "", bcc: "", subject: "s", body: "b", attachmentIds: [] }),
    draft: await window.benchClient.mail.composeDraft("self"),
    move: await window.benchClient.mail.move([1], "Archive"),
    remove: await window.benchClient.mail.remove([1], false),
    spam: await window.benchClient.mail.spam([1]),
    search: await window.benchClient.mail.searchBody("INBOX", "x"),
    pending: await window.benchClient.mail.consumePendingOpen(),
  }))()`)) as { account: unknown; folders: unknown[]; save: { ok: boolean }; send: { ok: boolean }; draft: { ok: boolean }; move: { ok: boolean }; remove: { ok: boolean }; spam: { ok: boolean }; search: { ok: boolean }; pending: unknown };
  check("안내 화면에서는 메일 통로가 막혀 있다 (계정·폴더 없음, 저장·보내기·초안 거절)", shellMail.account === null && shellMail.folders.length === 0 && shellMail.save.ok === false && shellMail.send.ok === false && shellMail.draft.ok === false && shellMail.move.ok === false && shellMail.remove.ok === false && shellMail.spam.ok === false && shellMail.search.ok === false && shellMail.pending === null);

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
    const cfg = JSON.parse(process.env.BENCH_SMOKE_MAIL) as { host: string; port: number; smtpPort?: number; user: string; pass: string };
    const call = (code: string) => w.webContents.executeJavaScript(code) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const account = (password: string, saveToSent = false) => JSON.stringify({ email: "e2e@test.local", username: cfg.user, password, imapHost: cfg.host, imapPort: cfg.port, smtpHost: cfg.host, smtpPort: cfg.smtpPort ?? 465, saveToSent });

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

    // 2-2b) 계정 두 개: 계정마다 받은 메일함·설정 파일이 따로다 (같은 가짜 서버에 두 번째 계정을 등록해 본다)
    const mailDirNow = path.join(app.getPath("userData"), "mail");
    const slot = (await call(`window.benchClient.mail.newSlot()`)) as string | null;
    const second = await call(`window.benchClient.mail.saveAccount(${JSON.stringify({ email: "e2e-second@test.local", username: cfg.user, password: cfg.pass, imapHost: cfg.host, imapPort: cfg.port, smtpHost: cfg.host, smtpPort: cfg.smtpPort ?? 465 })})`);
    check("[메일 계정 2개] 새 계정 칸을 만들고 두 번째 계정을 등록한다 (처음 계정과 다른 칸)", typeof slot === "string" && slot !== "main" && second.ok === true && second.value.email === "e2e-second@test.local");
    const secondEmptyList = await call(`window.benchClient.mail.list("INBOX", 0, 50)`);
    check("[메일 계정 2개] 두 번째 계정의 메일함은 처음에 비어 있다 (첫 계정의 메일이 섞이지 않는다)", (secondEmptyList.items as unknown[]).length === 0);
    const secondSync = await call(`window.benchClient.mail.sync("INBOX")`);
    const secondList = await call(`window.benchClient.mail.list("INBOX", 0, 50)`);
    check("[메일 계정 2개] 두 번째 계정을 동기화하면 그 계정의 메일함에만 메일이 들어온다", secondSync.ok === true && (secondList.items as unknown[]).length >= 3);
    const twoList = (await call(`window.benchClient.mail.accounts()`)) as { accounts: { id: string; email: string }[]; active: string };
    check("[메일 계정 2개] 등록된 계정 목록에 두 계정이 이메일과 함께 나오고 보는 계정은 두 번째이다", twoList.accounts.length === 2 && twoList.accounts.some((a) => a.id === "main" && a.email === "e2e@test.local") && twoList.accounts.some((a) => a.id === slot && a.email === "e2e-second@test.local") && twoList.active === slot);
    const totalUnread = (await call(`window.benchClient.mail.unread()`)) as number;
    check("[메일 계정 2개] 안 읽은 메일 수는 두 계정의 합계이다", typeof totalUnread === "number" && totalUnread >= 1);
    const back = await call(`window.benchClient.mail.useAccount("main")`);
    const mainAgain = await call(`window.benchClient.mail.list("INBOX", 0, 50)`);
    check("[메일 계정 2개] 첫 계정으로 돌아오면 첫 계정의 메일함과 설정이 그대로이다", back?.email === "e2e@test.local" && (mainAgain.items as unknown[]).length === (after.items as unknown[]).length);
    await call(`window.benchClient.mail.useAccount(${JSON.stringify(slot)})`);
    await call(`window.benchClient.mail.removeAccount()`);
    const oneList = (await call(`window.benchClient.mail.accounts()`)) as { accounts: { id: string }[]; active: string };
    check("[메일 계정 2개] 두 번째 계정을 지우면 그 칸의 받은 메일·설정 파일까지 사라지고 첫 계정으로 돌아간다", oneList.accounts.length === 1 && oneList.active === "main" && !fs.existsSync(path.join(mailDirNow, `mail-${slot}.db`)) && !fs.existsSync(path.join(mailDirNow, `account-${slot}.json`)) && fs.existsSync(path.join(mailDirNow, "account.json")));

    // 2-3) 메일 보내기 (BENCH_SMOKE_MAIL 의 smtpPort 가 있을 때): 같은 암호화(TLS)·인증서 검증으로 가짜 SMTP 서버에 보낸다
    if (cfg.smtpPort) {
      const reSaved = await call(`window.benchClient.mail.saveAccount(${account(cfg.pass, true)})`);
      check("[메일 쓰기] 보낸메일함 직접 저장을 켠 계정으로 다시 저장된다", reSaved.ok === true && reSaved.value.saveToSent === true);

      const self = await call(`window.benchClient.mail.composeDraft("self")`);
      check("[메일 쓰기] 내게쓰기 초안의 받는 사람이 내 주소다", self.ok === true && self.value.to === "e2e@test.local");

      const reply = await call(`window.benchClient.mail.composeDraft("reply", ${attMail.id})`);
      check("[메일 쓰기] 답장 초안: 제목 Re:, 받는 사람, 대화 이어 붙이기 정보", reply.ok === true && reply.value.subject === "Re: 첨부 메일" && /sender@test.local/.test(reply.value.to) && /^<.+>$/.test(reply.value.threading?.inReplyTo ?? ""));

      const fwd = await call(`window.benchClient.mail.composeDraft("forward", ${attMail.id})`);
      check("[메일 쓰기] 전달 초안에 원본 첨부(견적서.pdf)가 준비된다", fwd.ok === true && fwd.value.subject === "Fwd: 첨부 메일" && fwd.value.attachments.length === 1 && fwd.value.attachments[0].filename === "견적서.pdf");

      const sendFwd = await call(`window.benchClient.mail.send(${JSON.stringify({ fromName: "점검 담당", to: "dest@test.local", cc: "", bcc: "hidden@test.local", subject: fwd.value.subject, body: "전달합니다", attachmentIds: fwd.value.attachments.map((a: { id: string }) => a.id) })})`);
      check("[메일 쓰기] 전달 메일이 TLS 로 발송되고 보낸메일함에도 저장된다", sendFwd.ok === true && sendFwd.value.savedToSent === true);

      const sendReply = await call(`window.benchClient.mail.send(${JSON.stringify({ fromName: "점검 담당", to: reply.value.to, cc: "", bcc: "", subject: reply.value.subject, body: "회신합니다", attachmentIds: [], threading: reply.value.threading })})`);
      check("[메일 쓰기] 답장 메일이 발송된다", sendReply.ok === true);

      const rejected = await call(`window.benchClient.mail.send(${JSON.stringify({ fromName: "점검 담당", to: "nobody@test.local", cc: "", bcc: "", subject: "거절될 메일", body: "x", attachmentIds: [] })})`);
      check("[메일 쓰기] 서버가 받는 사람을 거절하면 안내 문구를 받는다", rejected.ok === false && String(rejected.error).includes("받는 사람 주소"));

      const invalid = await call(`window.benchClient.mail.send(${JSON.stringify({ fromName: "x", to: "bad-address", cc: "", bcc: "", subject: "s", body: "b", attachmentIds: [] })})`);
      check("[메일 쓰기] 잘못된 주소는 서버에 보내기 전에 거절된다", invalid.ok === false && String(invalid.error).includes("올바르지 않은"));

      const malformed = await call(`window.benchClient.mail.send({ to: 5 })`);
      check("[메일 쓰기] 형식이 틀린 요청은 거절된다", malformed.ok === false);

      const badAttach = await call(`window.benchClient.mail.send(${JSON.stringify({ fromName: "x", to: "a@test.local", cc: "", bcc: "", subject: "s", body: "b", attachmentIds: ["../../Windows/win.ini"] })})`);
      check("[메일 쓰기] 앱이 준비하지 않은 첨부 번호(경로)는 쓸 수 없다", badAttach.ok === false && String(badAttach.error).includes("첨부 파일을 찾을 수 없습니다"));
    }

    // 2-4) 새 메일 확인·알림·배지, 이동·삭제·스팸 신고·서버 본문 검색 (점검이 직접 가짜 서버에 새 메일을 넣는다)
    const appendRaw = async (subject: string, body: string) => {
      const c = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false, tls: { rejectUnauthorized: false } }); // 점검용 상대 서버에 메일을 넣는 접속(앱의 접속과 별개)
      await c.connect();
      try {
        const raw = ["From: Smoke Sender <smoke@test.local>", "To: e2e@test.local", `Subject: ${subject}`, "Date: Fri, 16 Oct 2026 09:00:00 +0900", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", body].join(String.fromCharCode(13, 10));
        await c.append("INBOX", Buffer.from(raw), [], new Date());
      } finally {
        await c.logout();
      }
    };
    const notices: { title: string; body: string; click: () => void }[] = [];
    showMailNotification = (title, body, click) => void notices.push({ title, body, click });

    const base = await mail!.pollInbox();
    if (base.ok) handlePollResult(mailRuntimes.get(activeMailId)!, base.value);
    check("[새 메일] 처음 확인에서는 이미 받아 둔 메일 때문에 알림이 뜨지 않는다", base.ok && base.value.newMail.length === 0 && notices.length === 0);

    await w.webContents.executeJavaScript(`window.__newmail = []; void window.benchClient.mail.onNewMail((items) => window.__newmail.push(items))`); // 반환값(함수)은 복사할 수 없으므로 버린다
    await appendRaw("NOTIFY-TEST", "알림 시험 본문");
    const poll1 = await mail!.pollInbox();
    if (poll1.ok) handlePollResult(mailRuntimes.get(activeMailId)!, poll1.value);
    check("[새 메일] 새로 도착한 안 읽은 메일 한 통이 알림으로 전달된다 (보낸 사람 이름·제목)", poll1.ok && poll1.value.newMail.length === 1 && notices.length === 1 && notices[0].title === "Smoke Sender" && notices[0].body === "NOTIFY-TEST");
    await sleep(150);
    const sidebarNew = await w.webContents.executeJavaScript("window.__newmail");
    check("[새 메일] ERP 창에도 새 메일(보낸 사람·제목)이 전달된다", sidebarNew.length === 1 && sidebarNew[0].length === 1 && sidebarNew[0][0].subject === "NOTIFY-TEST" && sidebarNew[0][0].from === "Smoke Sender" && typeof sidebarNew[0][0].id === "number");
    check("[새 메일] 작업 표시줄 배지가 메일 안 읽은 수를 따라간다", badgeMail === mail!.inboxUnread() && badgeMail >= 2);

    const poll2 = await mail!.pollInbox();
    if (poll2.ok) handlePollResult(mailRuntimes.get(activeMailId)!, poll2.value);
    check("[새 메일] 같은 메일은 두 번 알리지 않는다", poll2.ok && poll2.value.newMail.length === 0 && notices.length === 1);

    const winsBeforeNotice = BrowserWindow.getAllWindows().length;
    notices[0].click(); // 알림을 누른 것과 같다
    check("[새 메일] 알림을 누르면 메일 창이 열린다", await until(() => BrowserWindow.getAllWindows().length === winsBeforeNotice + 1));
    const noticeWindow = BrowserWindow.getAllWindows().find((x) => x !== w)!;
    await until(() => !noticeWindow.webContents.isLoading() && noticeWindow.webContents.getURL().endsWith("/mail"));
    const pendingId = await noticeWindow.webContents.executeJavaScript("window.benchClient.mail.consumePendingOpen()");
    const pendingAgain = await noticeWindow.webContents.executeJavaScript("window.benchClient.mail.consumePendingOpen()");
    check("[새 메일] 새로 열린 메일 창이 열어야 할 메일 번호를 한 번만 받는다", poll1.ok && pendingId?.id === poll1.value.newMail[0]?.id && pendingId?.accountId === activeMailId && pendingAgain === null);
    noticeWindow.destroy();

    const ids = async (folderPath: string) => ((await call(`window.benchClient.mail.list(${JSON.stringify(folderPath)}, 0, 100)`)) as { items: { id: number; subject: string }[] }).items;
    const idBySubject = async (folderPath: string, subject: string) => (await ids(folderPath)).find((m) => m.subject === subject)?.id;

    await appendRaw("CLEANUP-1", "스팸으로 보낼 메일");
    await appendRaw("CLEANUP-2", "서버 검색 시험 SMOKESEARCH 포함");
    await appendRaw("CLEANUP-3", "휴지통으로 보낼 메일");
    await call(`window.benchClient.mail.sync("INBOX")`);
    const [c1, c2, c3] = [await idBySubject("INBOX", "CLEANUP-1"), await idBySubject("INBOX", "CLEANUP-2"), await idBySubject("INBOX", "CLEANUP-3")];
    check("[메일 정리] 시험용 메일 3통이 받은메일함에 들어왔다", !!c1 && !!c2 && !!c3);

    const found = await call(`window.benchClient.mail.searchBody("INBOX", "SMOKESEARCH")`);
    check("[메일 정리] 서버 본문 검색이 본문에만 있는 단어로 그 메일을 찾는다", found.ok === true && found.value.ids.length === 1 && found.value.ids[0] === c2);
    const narrowed = (await call(`window.benchClient.mail.list("INBOX", 0, 50, { ids: ${JSON.stringify(found.ok ? found.value.ids : [])} })`)) as { items: { subject: string }[]; total: number };
    check("[메일 정리] 검색 결과 번호로 목록이 그 메일만 남는다", narrowed.total === 1 && narrowed.items[0].subject === "CLEANUP-2");

    const spamRes = await call(`window.benchClient.mail.spam([${c1}])`);
    check("[메일 정리] 스팸 신고하면 스팸메일함으로 옮겨진다", spamRes.ok === true && (await ids("Junk")).some((m) => m.subject === "CLEANUP-1") && !(await ids("INBOX")).some((m) => m.subject === "CLEANUP-1"));

    const moveRes = await call(`window.benchClient.mail.move([${c2}], "Archive")`);
    check("[메일 정리] 이동하면 고른 폴더로 옮겨진다", moveRes.ok === true && (await ids("Archive")).some((m) => m.subject === "CLEANUP-2") && !(await ids("INBOX")).some((m) => m.subject === "CLEANUP-2"));

    const permanentTooEarly = await call(`window.benchClient.mail.remove([${c3}], true)`);
    check("[메일 정리] 받은메일함의 메일은 완전 삭제할 수 없다 (먼저 휴지통으로)", permanentTooEarly.ok === false && (await ids("INBOX")).some((m) => m.subject === "CLEANUP-3"));

    const trashRes = await call(`window.benchClient.mail.remove([${c3}], false)`);
    check("[메일 정리] 삭제하면 휴지통으로 옮겨진다", trashRes.ok === true && trashRes.value.trashed === 1 && (await ids("Trash")).some((m) => m.subject === "CLEANUP-3"));

    const trashedId = await idBySubject("Trash", "CLEANUP-3");
    const purge = await call(`window.benchClient.mail.remove([${trashedId}], true)`);
    check("[메일 정리] 휴지통의 메일을 완전 삭제하면 서버에서도 사라진다", purge.ok === true && purge.value.deleted === 1 && !(await ids("Trash")).some((m) => m.subject === "CLEANUP-3"));

    const badMove = await call(`window.benchClient.mail.move([], "Archive")`);
    const badRemove = await call(`window.benchClient.mail.remove(["x"], false)`);
    const badFolder = await call(`window.benchClient.mail.move([1], "a" + String.fromCharCode(10) + "b")`);
    const manyIds = await call(`window.benchClient.mail.remove(Array.from({ length: 501 }, (_, i) => i + 1), false)`);
    check("[메일 정리] 형식이 틀린 요청(빈 목록·글자 번호·줄바꿈 폴더·501개)은 거절된다", badMove.ok === false && badRemove.ok === false && badFolder.ok === false && manyIds.ok === false);

    // 2-5) ERP 문서(PDF)를 첨부한 메일 쓰기, 안 읽은 수 (M4)
    const unreadNow = await call("window.benchClient.mail.unread()");
    check("[문서 메일] 화면이 안 읽은 메일 수를 물어볼 수 있다 (앱이 가진 숫자와 같다)", unreadNow === mail!.inboxUnread() && typeof unreadNow === "number");
    const pdfBytes = "new TextEncoder().encode('%PDF-1.4 smoke').buffer";
    const docPayload = (over: string) => `window.benchClient.mail.composeDocument({ to: "client@test.local", subject: "[견적서] 점검", body: "본문", doc: { type: "project_document", id: 7 }, filename: "견적서.pdf", data: ${pdfBytes}${over} })`;
    const notPdf = await call(`window.benchClient.mail.composeDocument({ to: "", subject: "s", body: "b", doc: { type: "project_document", id: 7 }, filename: "a.pdf", data: new TextEncoder().encode("MZ exe").buffer })`);
    const badDoc = await call(docPayload(", doc: { type: 'payment', id: 1 }"));
    check("[문서 메일] PDF 가 아닌 파일·알 수 없는 문서 종류는 거절된다", notPdf.ok === false && badDoc.ok === false);
    const winsBeforeDoc = BrowserWindow.getAllWindows().length;
    const docOpened = await call(docPayload(""));
    check("[문서 메일] 문서 PDF 를 넘기면 메일 창이 열린다", docOpened.ok === true && (await until(() => BrowserWindow.getAllWindows().length === winsBeforeDoc + 1)));
    const docWindow = BrowserWindow.getAllWindows().find((x) => x !== w)!;
    await until(() => !docWindow.webContents.isLoading() && docWindow.webContents.getURL().endsWith("/mail"));
    const pendingDoc = await docWindow.webContents.executeJavaScript("window.benchClient.mail.consumePendingCompose()");
    const pendingDocAgain = await docWindow.webContents.executeJavaScript("window.benchClient.mail.consumePendingCompose()");
    check("[문서 메일] 새 메일 창이 초안(받는 사람·제목·PDF 첨부)을 한 번만 받는다", pendingDoc?.draft?.to === "client@test.local" && pendingDoc.draft.attachments?.[0]?.filename === "견적서.pdf" && pendingDoc.doc?.id === 7 && pendingDocAgain === null);
    const sentDoc = await docWindow.webContents.executeJavaScript(`window.benchClient.mail.send({ fromName: "점검", to: "client@test.local", cc: "", bcc: "", subject: "[견적서] 점검", body: "본문", attachmentIds: ${JSON.stringify((pendingDoc?.draft?.attachments ?? []).map((x: { id: string }) => x.id))} })`);
    check("[문서 메일] 초안 그대로 보내면 PDF 가 첨부되어 나간다", sentDoc.ok === true);
    docWindow.destroy();

    // 2-7) 앱 업데이트 통로: 서버에 새 버전 정보가 없어도 오류 없이 답하고, 설치하지 않은 앱(개발 실행)에서는 설치를 시작하지 않는다
    const upCheck = await call("window.benchClient.update.check()");
    const upInstall = await call("window.benchClient.update.install()");
    check("[업데이트] 서버에 새 버전 정보가 없으면 오류로 알리고(앱은 멈추지 않는다), 설치하지 않은 앱에서는 바로 업데이트를 거절한다", upCheck.ok === false && upInstall.ok === false && String(upInstall.error).includes("설치해서"));

    // 2-6a) 주소록(받는 사람 자동완성): 위에서 보낸 문서 메일의 받는 사람이 올라가 있고, 입력한 글로 걸러지며, 지울 수 있다
    const bookAll = await call(`window.benchClient.mail.contacts("", 8)`);
    const bookFiltered = await call(`window.benchClient.mail.contacts("CLIENT@", 8)`);
    const bookNone = await call(`window.benchClient.mail.contacts("zzz-없는-사람", 8)`);
    check("[주소록] 메일을 보낸 받는 사람이 자동으로 올라가 있고(내 주소는 없다), 입력한 글로 걸러진다", bookAll.some((c: { address: string }) => c.address === "client@test.local") && !bookAll.some((c: { address: string }) => c.address === "e2e@test.local") && bookFiltered.length === 1 && bookNone.length === 0);
    const removed = await call(`window.benchClient.mail.removeContact("client@test.local")`);
    const badContactRemove = await call(`window.benchClient.mail.removeContact("not-an-email")`);
    const bookAfter = await call(`window.benchClient.mail.contacts("", 8)`);
    check("[주소록] 목록에서 지우면 사라지고, 형식이 틀린 주소는 지우지 않는다", removed === true && badContactRemove === false && !bookAfter.some((c: { address: string }) => c.address === "client@test.local"));

    // 2-6b) 주소록 관리: 직접 추가·수정·삭제, 잘못된 입력 거절
    const addSaved = await call(`window.benchClient.mail.saveContact({ name: "정혜란", address: "yurir@epik-bio.com", memo: "대표" })`);
    const bookNow = await call(`window.benchClient.mail.addressBook("")`);
    const renamed = await call(`window.benchClient.mail.saveContact({ name: "정혜란", address: "hr@epik-bio.com", memo: "대표", oldAddress: "yurir@epik-bio.com" })`);
    const bookRenamed = await call(`window.benchClient.mail.addressBook("epik")`);
    const badSave = await call(`window.benchClient.mail.saveContact({ name: "a", address: "not-an-email", memo: "" })`);
    const badShape = await call(`window.benchClient.mail.saveContact({ name: 5 })`);
    await call(`window.benchClient.mail.removeContact("hr@epik-bio.com")`);
    const bookEnd = await call(`window.benchClient.mail.addressBook("epik")`);
    check("[주소록] 연락처를 직접 추가하면 목록에 나오고(메모 포함), 주소를 고치면 예전 주소는 빠진다", addSaved.ok === true && bookNow.some((c: { address: string; memo: string; manual: boolean }) => c.address === "yurir@epik-bio.com" && c.memo === "대표" && c.manual) && renamed.ok === true && bookRenamed.length === 1 && bookRenamed[0].address === "hr@epik-bio.com");
    check("[주소록] 잘못된 주소·형식은 거절하고, 지운 연락처는 목록에서 사라진다", badSave.ok === false && badShape.ok === false && bookEnd.length === 0);

    // 2-6) 보내는 사람 목록 (이름·주소 선택)
    const idStart = await call("window.benchClient.mail.identities()");
    const idSave = await call(`window.benchClient.mail.saveIdentities({ items: [{ name: "정혜란", address: "yurir@epik-bio.com" }], defaultAddress: "yurir@epik-bio.com" })`);
    const idAfter = await call("window.benchClient.mail.identities()");
    const idBad = await call(`window.benchClient.mail.saveIdentities({ items: [{ name: "a", address: "not-an-email" }], defaultAddress: "" })`);
    const idStill = await call("window.benchClient.mail.identities()");
    check("[보내는 사람] 처음에는 비어 있고, 저장하면 다시 읽을 수 있다", idStart.items.length === 0 && idSave.ok === true && idAfter.items[0]?.address === "yurir@epik-bio.com" && idAfter.defaultAddress === "yurir@epik-bio.com");
    check("[보내는 사람] 형식이 틀린 주소는 저장을 거절하고 기존 설정을 지킨다", idBad.ok === false && idStill.items.length === 1);
    await call(`window.benchClient.mail.saveIdentities({ items: [], defaultAddress: "" })`);
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

  // 5) 화면 확대·축소: Ctrl + / Ctrl - / Ctrl 0 (브라우저와 같은 단계)
  const press = async (keyCode: string, ...modifiers: ("control" | "shift")[]) => {
    w.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    w.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await sleep(150);
  };
  await press("=", "control");
  const zoomedIn = w.webContents.getZoomFactor();
  await press("-", "control");
  await press("-", "control");
  const zoomedOut = w.webContents.getZoomFactor();
  await press("0", "control");
  const zoomReset = w.webContents.getZoomFactor();
  check("[확대·축소] Ctrl + 로 확대(110%), Ctrl - 로 축소(90%), Ctrl 0 으로 100%", Math.abs(zoomedIn - 1.1) < 0.01 && Math.abs(zoomedOut - 0.9) < 0.01 && zoomReset === 1);
  await press("=");
  check("[확대·축소] Ctrl 없이 + 만 누르면 바뀌지 않는다", w.webContents.getZoomFactor() === 1);

  // 6) 앱을 끝낼 때 ERP 로그아웃: 로그인 정보(토큰)만 지우고 다른 저장 값은 남긴다
  await w.webContents.executeJavaScript(`localStorage.setItem("erp_access_token", "smoke-token"); localStorage.setItem("other_pref", "keep")`);
  await logoutOnQuit();
  const afterQuit = await w.webContents.executeJavaScript(`[localStorage.getItem("erp_access_token"), localStorage.getItem("other_pref")]`);
  check("[종료] 앱을 끝낼 때 ERP 로그인 정보가 지워진다 (다른 설정은 그대로)", afterQuit[0] === null && afterQuit[1] === "keep");

  // 정상 종료 표시가 남았으면 다음 실행 때 로그인 정보를 건드리지 않고, 표시가 없으면(PC 종료·강제 종료) 지운다
  const tokenNow = () => w.webContents.executeJavaScript(`localStorage.getItem("erp_access_token")`);
  await w.webContents.executeJavaScript(`localStorage.setItem("erp_access_token", "again")`);
  await logoutIfNotCleanExit(); // 방금 logoutOnQuit 이 정상 종료 표시를 남겼다 → 그대로 둔다
  const keptAfterClean = await tokenNow();
  await logoutIfNotCleanExit(); // 표시는 한 번 쓰면 사라진다 → 이번에는 정상 종료가 아닌 것으로 본다
  const clearedAfterCrash = await tokenNow();
  check("[종료] 정상 종료 뒤 시작에는 로그인이 유지되고, 정상 종료가 아니었으면(PC 종료 등) 시작할 때 지워진다", keptAfterClean === "again" && clearedAfterCrash === null);
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

/**
 * 이미 실행 중인 앱이 없을 때만 시작한다. 업데이트 직후 설치 프로그램이 앱을 다시 켜는 순간에는 이전 앱이 아직 끝나는 중일 수 있으므로,
 * 그 경우(--updated)에는 이전 앱이 끝날 때까지 잠시 기다렸다가 시작한다 (바로 포기하면 아무 창도 뜨지 않은 채 끝나 버린다).
 */
async function acquireInstanceLock(): Promise<boolean> {
  if (app.requestSingleInstanceLock()) return true;
  if (!process.argv.includes(UPDATED_FLAG)) return false;
  for (let i = 0; i < UPDATE_LOCK_RETRIES; i++) {
    await new Promise((r) => setTimeout(r, UPDATE_LOCK_WAIT_MS));
    if (app.requestSingleInstanceLock()) return true;
  }
  return false;
}

void acquireInstanceLock().then((ok) => {
  if (ok) runApp();
  else {
    log.info("[Main] 이미 실행 중이라 종료합니다");
    app.quit();
  }
});

function runApp(): void {
  app.on("second-instance", () => {
    if (!quitting) showWindow(); // 끝나는 중인 앱의 창을 되살리지 않는다
  });
  app.on("before-quit", (event) => {
    quitting = true;
    // 앱을 끝낼 때는 ERP 에서 로그아웃한다 (다음에 켜면 로그인 화면). 저장소를 비우는 동안 잠깐 끝내기를 미뤘다가 다시 끝낸다
    if (!loggedOutOnQuit && !SMOKE && !updating) {
      loggedOutOnQuit = true;
      event.preventDefault();
      void logoutOnQuit().finally(() => app.quit());
      return;
    }
    if (deviceTimer) clearInterval(deviceTimer);
    for (const rt of mailRuntimes.values()) {
      rt.poller.stop();
      try {
        rt.store.close();
      } catch {
        /* 이미 닫힘 */
      }
    }
  });
  // 메인 창을 닫으면 앱이 끝난다. 창이 잠깐 모두 닫힌 사이(로그아웃 마무리 중 등)에는 여기서 따로 끝내지 않는다
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
    fs.rmSync(path.join(app.getPath("temp"), "bench-update"), { recursive: true, force: true }); // 지난번 업데이트에 쓴 설치 파일 정리
    if (!SMOKE) await logoutIfNotCleanExit();
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
      if (process.argv.includes(UPDATED_FLAG)) showWindow(); // 업데이트 뒤에는 창을 확실히 보여 준다 (트레이에만 숨지 않게)
      if (HIDDEN_START && !config.serverUrl) showWindow(); // 서버 주소를 아직 모르면 입력받아야 하므로 창을 띄운다
      void refreshDevice();
      deviceTimer = setInterval(() => void refreshDevice(), 60_000);
    }
  });
}
