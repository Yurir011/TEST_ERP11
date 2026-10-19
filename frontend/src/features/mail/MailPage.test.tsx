// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchClient, MailBridge, MailDetail, MailIdentitySettings, MailFolder, MailSummary } from "../../lib/desktop";

const notifyError = vi.fn();
const notify = vi.fn();
const confirm = vi.fn();
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ notifyError, notify, confirm }) }));
const reportDocumentMailSent = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("./documentMail", () => ({ reportDocumentMailSent }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { name: "박소장" } }) }));

import { MailPage } from "./MailPage";

const account = { email: "me@bench.co.kr", username: "me@bench.co.kr", imapHost: "imap.daum.net", imapPort: 993, smtpHost: "smtp.daum.net", smtpPort: 465, saveToSent: false };
const folders: MailFolder[] = [
  { path: "INBOX", name: "INBOX", specialUse: "\\Inbox", unread: 2, total: 2 },
  { path: "Sent", name: "Sent", specialUse: "\\Sent", unread: 0, total: 0 },
  { path: "Archive", name: "Archive", specialUse: "\\Archive", unread: 0, total: 0 },
  { path: "Trash", name: "Trash", specialUse: "\\Trash", unread: 0, total: 0 },
  { path: "Junk", name: "Junk", specialUse: "\\Junk", unread: 0, total: 0 },
];
const mails: MailSummary[] = [
  { id: 1, folder: "INBOX", uid: 1, subject: "견적서 송부", fromName: "김영업", fromAddr: "kim@t.l", date: new Date(2026, 9, 16, 9, 0).getTime(), seen: false, flagged: false, hasAttachments: true },
  { id: 2, folder: "INBOX", uid: 2, subject: "회의 안내", fromName: "", fromAddr: "boss@t.l", date: new Date(2026, 9, 15, 9, 0).getTime(), seen: true, flagged: true, hasAttachments: false },
];
const detail = (over: Partial<MailDetail> = {}): MailDetail => ({
  ...mails[0],
  seen: true,
  to: "me@bench.co.kr",
  cc: "",
  text: "텍스트 본문",
  html: "<p>HTML 본문</p>",
  remoteImagesBlocked: false,
  attachments: [{ index: 0, filename: "견적서.pdf", contentType: "application/pdf", size: 2048 }],
  ...over,
});

/** 앱이 화면에 보내는 신호(새 메일 확인 결과, 알림 클릭)를 시험에서 직접 보낼 수 있게 붙잡아 둔다 */
const handlers: { changed: (() => void) | null; open: ((p: { id: number }) => void) | null; compose: (() => void) | null } = { changed: null, open: null, compose: null };

function installMail(over: Partial<MailBridge> = {}) {
  const bridge: MailBridge = {
    openWindow: vi.fn().mockResolvedValue(undefined),
    account: vi.fn().mockResolvedValue(account),
    contacts: vi.fn().mockResolvedValue([]),
    removeContact: vi.fn().mockResolvedValue(true),
    identities: vi.fn().mockResolvedValue({ items: [], defaultAddress: "" }),
    saveIdentities: vi.fn((input: unknown) => Promise.resolve({ ok: true as const, value: input as MailIdentitySettings })),
    saveAccount: vi.fn().mockResolvedValue({ ok: true, value: account }),
    removeAccount: vi.fn().mockResolvedValue(undefined),
    folders: vi.fn().mockResolvedValue(folders),
    sync: vi.fn().mockResolvedValue({ ok: true, value: { added: 0, removed: 0 } }),
    list: vi.fn().mockResolvedValue({ items: mails, total: 2 }),
    get: vi.fn().mockResolvedValue({ ok: true, value: detail() }),
    markSeen: vi.fn().mockResolvedValue(undefined),
    setFlagged: vi.fn().mockResolvedValue(undefined),
    saveAttachment: vi.fn().mockResolvedValue({ ok: true, value: { filename: "견적서.pdf" } }),
    openAttachment: vi.fn().mockResolvedValue({ ok: true, value: { filename: "견적서.pdf" } }),
    composeDraft: vi.fn().mockResolvedValue({ ok: true, value: { to: "김영업 <kim@t.l>", cc: "", subject: "Re: 견적서 송부", body: "\n\n원본 인용", attachments: [], threading: { inReplyTo: "<orig@t.l>", references: ["<orig@t.l>"] } } }),
    pickAttachments: vi.fn().mockResolvedValue({ ok: true, value: [{ id: "att-1", filename: "자료.xlsx", size: 4096 }] }),
    discardAttachments: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue({ ok: true, value: { messageId: "<new@bench.co.kr>", savedToSent: null } }),
    move: vi.fn().mockResolvedValue({ ok: true, value: { moved: 1 } }),
    remove: vi.fn().mockResolvedValue({ ok: true, value: { trashed: 1, deleted: 0 } }),
    spam: vi.fn().mockResolvedValue({ ok: true, value: { moved: 1 } }),
    searchBody: vi.fn().mockResolvedValue({ ok: true, value: { ids: [2] } }),
    onChanged: vi.fn((cb: () => void) => {
      handlers.changed = cb;
      return () => {
        handlers.changed = null;
      };
    }),
    onOpenMessage: vi.fn((cb: (p: { id: number }) => void) => {
      handlers.open = cb;
      return () => {
        handlers.open = null;
      };
    }),
    consumePendingOpen: vi.fn().mockResolvedValue(null),
    composeDocument: vi.fn().mockResolvedValue({ ok: true, value: null }),
    onOpenCompose: vi.fn((cb: () => void) => {
      handlers.compose = cb;
      return () => {
        handlers.compose = null;
      };
    }),
    consumePendingCompose: vi.fn().mockResolvedValue(null),
    unread: vi.fn().mockResolvedValue(0),
    onUnread: vi.fn(() => () => {}),
    ...over,
  };
  window.benchClient = { mail: bridge } as unknown as BenchClient;
  return bridge;
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <MailPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  handlers.changed = null;
  handlers.open = null;
  handlers.compose = null;
  reportDocumentMailSent.mockClear();
  notifyError.mockReset();
  notify.mockReset();
  confirm.mockReset();
});

afterEach(() => {
  cleanup();
  delete window.benchClient;
});

describe("앱이 아닐 때", () => {
  it("브라우저에서는 앱 전용이라고 안내한다", () => {
    renderPage();
    expect(screen.getByText(/데스크톱 앱에서만 사용/)).toBeTruthy();
  });

  it("메일 기능이 없는 예전 앱도 같은 안내를 한다", () => {
    window.benchClient = {} as unknown as BenchClient;
    renderPage();
    expect(screen.getByText(/데스크톱 앱에서만 사용/)).toBeTruthy();
  });
});

describe("계정 등록", () => {
  it("계정이 없으면 등록 폼을 보여 주고, 비밀번호는 가려 두며 눈 버튼으로 볼 수 있다", async () => {
    installMail({ account: vi.fn().mockResolvedValue(null) });
    renderPage();
    const pw = (await screen.findByLabelText("메일 비밀번호")) as HTMLInputElement;
    expect(pw.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(pw.type).toBe("text");
  });

  it("등록하면 앱에 입력값을 전달하고, 성공하면 메일 화면으로 간다", async () => {
    const bridge = installMail({ account: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(account) });
    renderPage();
    fireEvent.change(await screen.findByLabelText("이메일 주소"), { target: { value: "me@bench.co.kr" } });
    fireEvent.change(screen.getByLabelText("메일 비밀번호"), { target: { value: "내-비밀번호" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(bridge.saveAccount).toHaveBeenCalled());
    expect(bridge.saveAccount).toHaveBeenCalledWith({
      email: "me@bench.co.kr",
      username: undefined,
      password: "내-비밀번호",
      imapHost: "imap.daum.net",
      imapPort: 993,
      smtpHost: "smtp.daum.net",
      smtpPort: 465,
      saveToSent: false,
    });
    expect(await screen.findByRole("navigation", { name: "메일 폴더" })).toBeTruthy();
  });

  it("접속에 실패하면 안내 문구를 보여 주고 폼을 유지한다", async () => {
    installMail({
      account: vi.fn().mockResolvedValue(null),
      saveAccount: vi.fn().mockResolvedValue({ ok: false, error: "로그인에 실패했습니다. 이메일·비밀번호를 확인하세요." }),
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText("이메일 주소"), { target: { value: "me@bench.co.kr" } });
    fireEvent.change(screen.getByLabelText("메일 비밀번호"), { target: { value: "틀림" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect((await screen.findByRole("alert")).textContent).toContain("로그인에 실패");
    expect(screen.getByLabelText("메일 비밀번호")).toBeTruthy();
  });
});

describe("화면 구성", () => {
  it("왼쪽에 내 이름·메일 주소, 폴더 목록(전체메일 포함), 안 읽은 수가 나온다", async () => {
    installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    const side = screen.getByRole("complementary", { name: "메일 메뉴" });
    expect(within(side).getByText("박소장")).toBeTruthy();
    expect(within(side).getByText("me@bench.co.kr")).toBeTruthy();
    const nav = within(side).getByRole("navigation", { name: "메일 폴더" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent?.replace(/\d+$/, ""))).toEqual(["전체메일", "받은메일함", "보낸메일함", "보관함", "스팸메일함", "휴지통"]);
    expect(within(nav).getByLabelText("안 읽은 메일 2개")).toBeTruthy();
  });

  it("목록은 한 줄씩: 보낸 사람(이름 없으면 주소)·제목·날짜, 안 읽음/읽음, 별표, 첨부 표시", async () => {
    installMail();
    renderPage();
    await screen.findByText("김영업"); // 목록 틀은 먼저 그려지고 메일은 저장소에서 읽은 뒤에 나온다
    const list = screen.getByRole("list", { name: "메일 목록" });
    expect(within(list).getByText("김영업")).toBeTruthy();
    expect(within(list).getByText("boss@t.l")).toBeTruthy();
    expect(within(list).getByLabelText("안 읽음")).toBeTruthy();
    expect(within(list).getByLabelText("읽음")).toBeTruthy();
    expect(within(list).getByLabelText("첨부 파일 있음")).toBeTruthy();
    expect(within(list).getByRole("button", { name: "중요 표시 해제" })).toBeTruthy(); // 2번 메일은 별표
    expect(within(list).getByRole("button", { name: "중요 표시" })).toBeTruthy();
  });

  it("메일을 고르기 전에는 삭제·스팸신고·전달·이동·읽음 표시를 쓸 수 없다", async () => {
    installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    for (const name of ["삭제", "스팸신고", "전달", /이동/, /읽음 표시/]) {
      const b = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(b.disabled, String(name)).toBe(true);
    }
  });

  it("열면 저장된 목록을 보여 주고 곧바로 서버와 동기화한다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    await waitFor(() => expect(bridge.sync).toHaveBeenCalledWith("INBOX"));
    expect(bridge.list).toHaveBeenCalledWith("INBOX", 0, 20, { query: undefined });
  });

  it("동기화에 실패하면 안내를 보여 주되 저장된 메일은 계속 보인다", async () => {
    installMail({ sync: vi.fn().mockResolvedValue({ ok: false, error: "메일 서버에 연결할 수 없습니다." }) });
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain("연결할 수 없습니다");
    expect(await screen.findByText("견적서 송부")).toBeTruthy();
  });
});

describe("목록 조작", () => {
  it("별표를 누르면 앱에 알린다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "중요 표시" }));
    await waitFor(() => expect(bridge.setFlagged).toHaveBeenCalledWith(1, true));
  });

  it("선택하지 않으면 [읽음 표시]를 쓸 수 없고, 선택하면 읽음/안 읽음으로 바꾼다. 선택 수가 보인다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    expect((screen.getByRole("button", { name: /읽음 표시/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("선택 0개, 전체 2개")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("견적서 송부 선택"));
    expect(screen.getByLabelText("선택 1개, 전체 2개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /읽음 표시/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "읽음으로 표시" }));
    await waitFor(() => expect(bridge.markSeen).toHaveBeenCalledWith(1, true));
    expect(bridge.markSeen).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("선택 0개, 전체 2개")).toBeTruthy(); // 처리 후 선택은 풀린다

    fireEvent.click(screen.getByLabelText("현재 쪽 메일 모두 선택"));
    expect(screen.getByLabelText("선택 2개, 전체 2개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /읽음 표시/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "안 읽음으로 표시" }));
    await waitFor(() => expect(bridge.markSeen).toHaveBeenCalledWith(2, false));
    expect(bridge.markSeen).toHaveBeenCalledWith(1, false);
  });

  it("빠른 조건(안읽음)을 켜면 그 조건으로 목록을 다시 읽고, 다시 누르면 푼다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    const unread = screen.getByRole("button", { name: "안읽음" });
    expect(unread.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(unread);
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { unread: true, query: undefined }));
    expect(screen.getByRole("button", { name: "안읽음" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "중요" }));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { unread: true, flagged: true, query: undefined }));
    fireEvent.click(screen.getByRole("button", { name: "안읽음" }));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { unread: false, flagged: true, query: undefined }));
  });

  it("검색어를 넣으면 그 검색어로 목록을 읽고, [지우기]로 되돌린다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    fireEvent.change(screen.getByLabelText("메일 검색"), { target: { value: "견적" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { query: "견적" }));
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { query: undefined }));
  });

  it("폴더를 누르면 그 폴더로 바꾸고 동기화한다 (전체메일은 전체 동기화)", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    fireEvent.click(screen.getByRole("button", { name: /보낸메일함/ }));
    await waitFor(() => expect(bridge.sync).toHaveBeenCalledWith("Sent"));
    await waitFor(() => expect(bridge.list).toHaveBeenCalledWith("Sent", 0, 20, { query: undefined }));
    expect(screen.getByLabelText("현재 폴더").textContent).toBe("보낸메일함");
    fireEvent.click(screen.getByRole("button", { name: /전체메일/ }));
    await waitFor(() => expect(bridge.sync).toHaveBeenCalledWith("*"));
    await waitFor(() => expect(bridge.list).toHaveBeenCalledWith("*", 0, 20, { query: undefined }));
    expect(screen.getByLabelText("현재 폴더").textContent).toBe("전체메일");
  });

  it("쪽 번호로 이동하고, 보기 설정으로 한 쪽 메일 수를 바꾼다", async () => {
    const bridge = installMail({ list: vi.fn().mockResolvedValue({ items: mails, total: 45 }) });
    renderPage();
    await screen.findByText("견적서 송부");
    const pager = screen.getByRole("navigation", { name: "쪽 이동" });
    expect(within(pager).getAllByRole("button").map((b) => b.textContent)).toEqual(["1", "2", "3", "›"]);
    fireEvent.click(within(pager).getByRole("button", { name: "2" }));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 20, 20, { query: undefined }));
    expect(within(screen.getByRole("navigation", { name: "쪽 이동" })).getByRole("button", { name: "2" }).getAttribute("aria-current")).toBe("page");
    fireEvent.change(screen.getByLabelText("보기 설정"), { target: { value: "50" } });
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 50, { query: undefined }));
  });
});

describe("메일 읽기", () => {
  it("메일을 누르면 읽기 화면에서 본문을 격리된 틀로 보여 주고, [목록]으로 돌아온다", async () => {
    const bridge = installMail();
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    await waitFor(() => expect(bridge.get).toHaveBeenCalledWith(1, false));
    const frame = await waitFor(() => {
      const el = container.querySelector("iframe");
      if (!el) throw new Error("아직");
      return el;
    });
    expect(frame.getAttribute("srcdoc")).toContain("HTML 본문");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(screen.getByRole("list", { name: "첨부 파일" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "메일 목록" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /목록/ }));
    expect(await screen.findByRole("list", { name: "메일 목록" })).toBeTruthy();
  });

  it("HTML 이 없으면 텍스트를 그대로 보여 준다", async () => {
    installMail({ get: vi.fn().mockResolvedValue({ ok: true, value: detail({ html: null, text: "텍스트만 있는 메일" }) }) });
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    expect(await screen.findByText("텍스트만 있는 메일")).toBeTruthy();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("외부 이미지를 막았다고 알리고, [이미지 보기]를 누르면 허용해서 다시 연다", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: detail({ remoteImagesBlocked: true }) })
      .mockResolvedValue({ ok: true, value: detail({ remoteImagesBlocked: false }) });
    installMail({ get });
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    fireEvent.click(await screen.findByRole("button", { name: "이미지 보기" }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(1, true));
    await waitFor(() => expect(container.querySelector("iframe")!.getAttribute("srcdoc")).toMatch(/img-src data: https:/));
    expect(screen.queryByRole("button", { name: "이미지 보기" })).toBeNull();
  });

  it("메일을 못 열면 안내 문구를 보여 준다", async () => {
    installMail({ get: vi.fn().mockResolvedValue({ ok: false, error: "서버에서 메일을 찾을 수 없습니다." }) });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    expect((await screen.findByText(/서버에서 메일을 찾을 수 없습니다/)).textContent).toBeTruthy();
  });

  it("첨부 [열기]·[저장]은 앱에 요청하고, 실패하면 알린다. 사용자가 취소한 것은 알리지 않는다", async () => {
    const bridge = installMail({
      openAttachment: vi.fn().mockResolvedValue({ ok: false, error: "이 파일을 열 수 있는 프로그램이 없습니다." }),
      saveAttachment: vi.fn().mockResolvedValue({ ok: false, error: "취소했습니다.", canceled: true }),
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    const list = await screen.findByRole("list", { name: "첨부 파일" });
    fireEvent.click(within(list).getByRole("button", { name: "열기" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("이 파일을 열 수 있는 프로그램이 없습니다."));
    fireEvent.click(within(list).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(bridge.saveAttachment).toHaveBeenCalledWith(1, 0));
    expect(notifyError).toHaveBeenCalledTimes(1);
  });

  it("읽기 화면에서 [안 읽음으로 표시]를 누르면 표시를 바꾸고 목록으로 돌아간다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    fireEvent.click(await screen.findByRole("button", { name: "안 읽음으로 표시" }));
    await waitFor(() => expect(bridge.markSeen).toHaveBeenCalledWith(1, false));
    expect(await screen.findByRole("list", { name: "메일 목록" })).toBeTruthy();
  });

  it("읽기 화면에서 중요 표시를 바꿀 수 있다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    fireEvent.click(await screen.findByRole("button", { name: "이 메일 중요 표시" }));
    await waitFor(() => expect(bridge.setFlagged).toHaveBeenCalledWith(1, true));
  });
});

describe("메일 쓰기", () => {
  const fill = async (id: string, value: string) => fireEvent.change(await screen.findByLabelText(id), { target: { value } });

  it("[메일쓰기]를 누르면 빈 쓰기 화면이 열리고, 보내면 앱에 내용을 전달한다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    expect(await screen.findByRole("form", { name: "메일 쓰기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "보내는 사람 선택" }).textContent).toContain("박소장"); // 처음에는 ERP 사용자 이름 + 내 계정 주소
    expect(screen.getByRole("button", { name: "보내는 사람 선택" }).textContent).toContain("me@bench.co.kr");
    await fill("받는사람", "kim@t.l, lee@t.l");
    await fill("제목", "견적서 송부");
    await fill("본문", "안녕하세요");
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(bridge.send).toHaveBeenCalledTimes(1));
    expect(bridge.send).toHaveBeenCalledWith({ fromName: "박소장", fromAddress: "me@bench.co.kr", to: "kim@t.l, lee@t.l", cc: "", bcc: "", subject: "견적서 송부", body: "안녕하세요", attachmentIds: [], threading: undefined });
    await waitFor(() => expect(notify).toHaveBeenCalledWith("메일을 보냈습니다."));
    expect(await screen.findByRole("list", { name: "메일 목록" })).toBeTruthy(); // 보낸 뒤 목록으로 돌아온다
  });

  describe("보내는 사람 선택", () => {
    const settings = {
      items: [
        { name: "정혜란", address: "yurir@epik-bio.com" },
        { name: "", address: "alias@bench.co.kr" },
      ],
      defaultAddress: "",
    };
    const openList = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
      fireEvent.click(await screen.findByRole("button", { name: "보내는 사람 선택" }));
      return screen.findByRole("listbox", { name: "보내는 사람 목록" });
    };

    it("목록에서 고르면 그 이름·주소로 나간다 (이름이 비어 있으면 ERP 사용자 이름)", async () => {
      const bridge = installMail({ identities: vi.fn().mockResolvedValue(settings) });
      renderPage();
      const list = await openList();
      const names = within(list).getAllByRole("option").map((o) => o.textContent);
      expect(names).toEqual(["박소장 <me@bench.co.kr>", "정혜란 <yurir@epik-bio.com>", "박소장 <alias@bench.co.kr>"]);
      fireEvent.click(within(list).getByRole("option", { name: "정혜란 <yurir@epik-bio.com>" }));
      expect(screen.queryByRole("listbox")).toBeNull(); // 고르면 닫힌다
      await fill("받는사람", "a@t.l");
      fireEvent.click(screen.getByRole("button", { name: "보내기" }));
      await waitFor(() => expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ fromName: "정혜란", fromAddress: "yurir@epik-bio.com" })));
    });

    it("목록을 읽는 중에 직접 고른 주소는 늦게 도착한 기본값이 덮어쓰지 않는다", async () => {
      let resolve: (v: typeof settings) => void = () => {};
      const slow = new Promise<typeof settings>((r) => (resolve = r));
      installMail({ identities: vi.fn().mockReturnValue(slow) });
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
      fireEvent.click(await screen.findByRole("button", { name: "보내는 사람 선택" })); // 아직 목록은 로그인 계정뿐
      fireEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "박소장 <me@bench.co.kr>" }));
      resolve({ ...settings, defaultAddress: "yurir@epik-bio.com" }); // 이제서야 기본값이 도착
      await waitFor(() => expect(screen.getByRole("button", { name: "보내는 사람 선택" })).toBeTruthy());
      await new Promise((r) => setTimeout(r, 30));
      expect(screen.getByRole("button", { name: "보내는 사람 선택" }).textContent).toContain("me@bench.co.kr");
    });

    it("기본으로 정한 주소가 처음부터 골라져 있다", async () => {
      installMail({ identities: vi.fn().mockResolvedValue({ ...settings, defaultAddress: "yurir@epik-bio.com" }) });
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "보내는 사람 선택" }).textContent).toContain("yurir@epik-bio.com"));
    });

    it("[보내는 사람 추가 / 관리]에서 추가하고 기본으로 정해 저장하면 목록에 나타난다", async () => {
      const bridge = installMail();
      renderPage();
      const list = await openList();
      fireEvent.click(within(list).getByRole("button", { name: /보내는 사람 추가 \/ 관리/ }));
      const dialog = await screen.findByRole("dialog", { name: "보내는 사람 관리" });
      fireEvent.click(within(dialog).getByRole("button", { name: "보내는 사람 추가" }));
      fireEvent.change(within(dialog).getByLabelText("이름 1"), { target: { value: "정혜란" } });
      fireEvent.change(within(dialog).getByLabelText("주소 1"), { target: { value: "yurir@epik-bio.com" } });
      fireEvent.click(within(dialog).getByLabelText("yurir@epik-bio.com 를 기본으로"));
      fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(bridge.saveIdentities).toHaveBeenCalledWith({ items: [{ name: "정혜란", address: "yurir@epik-bio.com" }], defaultAddress: "yurir@epik-bio.com" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "보내는 사람 선택" }));
      expect(within(await screen.findByRole("listbox")).getByRole("option", { name: "정혜란 <yurir@epik-bio.com>" })).toBeTruthy();
    });

    it("저장이 거절되면 이유를 보여 주고 창을 닫지 않는다", async () => {
      installMail({ identities: vi.fn().mockResolvedValue(settings), saveIdentities: vi.fn().mockResolvedValue({ ok: false, error: "올바르지 않은 메일 주소입니다: x" }) });
      renderPage();
      const list = await openList();
      fireEvent.click(within(list).getByRole("button", { name: /보내는 사람 추가 \/ 관리/ }));
      const dialog = await screen.findByRole("dialog", { name: "보내는 사람 관리" });
      fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
      expect(await within(dialog).findByRole("alert")).toBeTruthy();
      expect(screen.getByRole("dialog", { name: "보내는 사람 관리" })).toBeTruthy();
    });

    it("고르고 있던 주소를 목록에서 지우면 로그인 계정으로 돌아간다", async () => {
      installMail({ identities: vi.fn().mockResolvedValue(settings) });
      renderPage();
      const list = await openList();
      fireEvent.click(within(list).getByRole("option", { name: "정혜란 <yurir@epik-bio.com>" }));
      fireEvent.click(screen.getByRole("button", { name: "보내는 사람 선택" }));
      fireEvent.click(within(await screen.findByRole("listbox")).getByRole("button", { name: /보내는 사람 추가 \/ 관리/ }));
      const dialog = await screen.findByRole("dialog", { name: "보내는 사람 관리" });
      fireEvent.click(within(dialog).getByRole("button", { name: "yurir@epik-bio.com 지우기" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByRole("button", { name: "보내는 사람 선택" }).textContent).toContain("me@bench.co.kr");
    });

    it("보내는 사람만 바꾸고는 '작성 중' 으로 보지 않는다", async () => {
      installMail({ identities: vi.fn().mockResolvedValue(settings) });
      renderPage();
      const list = await openList();
      fireEvent.click(within(list).getByRole("option", { name: "정혜란 <yurir@epik-bio.com>" }));
      fireEvent.click(screen.getByRole("button", { name: "취소" }));
      await waitFor(() => expect(screen.queryByRole("form", { name: "메일 쓰기" })).toBeNull());
      expect(confirm).not.toHaveBeenCalled();
    });
  });

  it("참조·숨은참조 칸은 눌러야 나타나고 함께 전달된다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    expect(screen.queryByLabelText("참조")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "참조" }));
    fireEvent.click(screen.getByRole("button", { name: "숨은참조" }));
    await fill("받는사람", "a@t.l");
    await fill("참조", "b@t.l");
    await fill("숨은참조", "c@t.l");
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(bridge.send).toHaveBeenCalled());
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ to: "a@t.l", cc: "b@t.l", bcc: "c@t.l" }));
  });

  it("[내게쓰기]는 받는 사람이 내 주소로 채워진다", async () => {
    const bridge = installMail({ composeDraft: vi.fn().mockResolvedValue({ ok: true, value: { to: "me@bench.co.kr", cc: "", subject: "", body: "", attachments: [] } }) });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "내게쓰기" }));
    await waitFor(() => expect(bridge.composeDraft).toHaveBeenCalledWith("self", undefined));
    expect(((await screen.findByLabelText("받는사람")) as HTMLInputElement).value).toBe("me@bench.co.kr");
  });

  it("읽기 화면의 [답장]은 초안을 채워 열고, 보낼 때 대화 이어 붙이기 정보도 함께 보낸다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    fireEvent.click(await screen.findByRole("button", { name: "답장" }));
    await waitFor(() => expect(bridge.composeDraft).toHaveBeenCalledWith("reply", 1));
    expect(((await screen.findByLabelText("받는사람")) as HTMLInputElement).value).toBe("김영업 <kim@t.l>");
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("Re: 견적서 송부");
    expect((screen.getByLabelText("본문") as HTMLTextAreaElement).value).toContain("원본 인용");
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ threading: { inReplyTo: "<orig@t.l>", references: ["<orig@t.l>"] } })));
  });

  it("[전체답장]과 [전달]도 각각의 초안을 요청한다. 전달은 원본 첨부가 붙어 있다", async () => {
    const bridge = installMail({
      composeDraft: vi.fn().mockResolvedValue({ ok: true, value: { to: "", cc: "", subject: "Fwd: 견적서 송부", body: "전달 본문", attachments: [{ id: "fw-1", filename: "요청서.pdf", size: 2048 }] } }),
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    fireEvent.click(await screen.findByRole("button", { name: "전체답장" }));
    await waitFor(() => expect(bridge.composeDraft).toHaveBeenCalledWith("replyAll", 1));
    fireEvent.click(screen.getByRole("button", { name: "취소" })); // 내용을 바꾸지 않았으니 바로 닫힌다
    await waitFor(() => expect(screen.queryByRole("form", { name: "메일 쓰기" })).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "전달" })); // 취소하면 보던 메일 화면으로 돌아온다
    await waitFor(() => expect(bridge.composeDraft).toHaveBeenCalledWith("forward", 1));
    expect(within(await screen.findByRole("list", { name: "첨부할 파일" })).getByText("요청서.pdf")).toBeTruthy();
  });

  it("[파일 첨부]로 첨부를 추가하고 빼면 앱에 알린다. 보낼 때 첨부 번호가 간다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    fireEvent.click(await screen.findByRole("button", { name: /파일 첨부/ }));
    expect(await screen.findByText("자료.xlsx")).toBeTruthy();
    await fill("받는사람", "a@t.l");
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ attachmentIds: ["att-1"] })));
  });

  it("첨부를 빼면 앱에도 버리라고 알린다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    fireEvent.click(await screen.findByRole("button", { name: /파일 첨부/ }));
    fireEvent.click(await screen.findByRole("button", { name: "자료.xlsx 첨부 빼기" }));
    await waitFor(() => expect(bridge.discardAttachments).toHaveBeenCalledWith(["att-1"]));
    expect(screen.queryByText("자료.xlsx")).toBeNull();
  });

  it("파일 선택을 취소하면 아무 일도 없고, 실패하면 안내한다", async () => {
    const pick = vi.fn().mockResolvedValueOnce({ ok: false, error: "취소했습니다.", canceled: true }).mockResolvedValueOnce({ ok: false, error: "파일이 너무 큽니다(최대 20MB): big.bin" });
    installMail({ pickAttachments: pick });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    fireEvent.click(await screen.findByRole("button", { name: /파일 첨부/ }));
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /파일 첨부/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("너무 큽니다");
  });

  it("보내기에 실패하면 안내를 보여 주고 쓰던 내용은 그대로 둔다", async () => {
    installMail({ send: vi.fn().mockResolvedValue({ ok: false, error: "받는 사람 주소를 서버가 받아들이지 않았습니다. 주소를 확인하세요." }) });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    await fill("받는사람", "x@t.l");
    await fill("본문", "쓰던 내용");
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("받아들이지 않았습니다");
    expect((screen.getByLabelText("본문") as HTMLTextAreaElement).value).toBe("쓰던 내용");
    expect(notify).not.toHaveBeenCalled();
  });

  it("보내는 중에 [보내기]를 여러 번 눌러도 한 번만 보낸다", async () => {
    let release: (v: unknown) => void = () => {};
    const send = vi.fn().mockImplementation(() => new Promise((r) => (release = r)));
    installMail({ send });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    await fill("받는사람", "a@t.l");
    const btn = screen.getByRole("button", { name: "보내기" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.keyDown(screen.getByRole("form", { name: "메일 쓰기" }), { key: "Enter", ctrlKey: true });
    expect(send).toHaveBeenCalledTimes(1);
    release({ ok: true, value: { messageId: "<x@y>", savedToSent: null } });
    await waitFor(() => expect(notify).toHaveBeenCalled());
  });

  it("보낸메일함에 저장하지 못했다면 보냈다는 말과 함께 알린다", async () => {
    installMail({ send: vi.fn().mockResolvedValue({ ok: true, value: { messageId: "<x@y>", savedToSent: false } }) });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    await fill("받는사람", "a@t.l");
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.stringContaining("보낸메일함에는 저장하지 못했습니다")));
  });

  it("쓰던 내용이 있으면 [취소]에서 버릴지 묻고, 버리면 첨부 준비도 지운다", async () => {
    const bridge = installMail();
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    fireEvent.click(await screen.findByRole("button", { name: /파일 첨부/ }));
    await screen.findByText("자료.xlsx");
    await fill("본문", "쓰던 내용");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("form", { name: "메일 쓰기" })).toBeTruthy(); // 계속 쓴다
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "메일 쓰기" })).toBeNull());
    expect(bridge.discardAttachments).toHaveBeenCalledWith(["att-1"]);
  });

  it("쓰는 중에 다른 폴더로 가려 하면 버릴지 묻는다", async () => {
    installMail();
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    await fill("본문", "쓰던 내용");
    fireEvent.click(screen.getByRole("button", { name: /보낸메일함/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("form", { name: "메일 쓰기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /보낸메일함/ }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "메일 쓰기" })).toBeNull());
  });

  it("계정 설정에서 [보낸 메일 직접 저장]을 켜면 앱에 전달된다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    fireEvent.click(screen.getByRole("button", { name: "메일 계정 설정" }));
    fireEvent.click(await screen.findByRole("button", { name: /서버 설정 보기/ }));
    fireEvent.click(screen.getByLabelText(/보낸 메일을 보낸메일함에도 직접 저장/));
    fireEvent.change(screen.getByLabelText("메일 비밀번호"), { target: { value: "비번" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(bridge.saveAccount).toHaveBeenCalledWith(expect.objectContaining({ saveToSent: true })));
  });
});

describe("메일 정리: 삭제·스팸신고·이동·전달", () => {
  const pick = async (subject: string) => fireEvent.click(await screen.findByLabelText(`${subject} 선택`));

  it("[삭제]는 고른 메일을 휴지통으로 옮기고 알려 준다 (여러 통 가능)", async () => {
    const bridge = installMail();
    renderPage();
    await pick("견적서 송부");
    await pick("회의 안내");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(bridge.remove).toHaveBeenCalledWith([1, 2], false));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("메일 1통을 휴지통으로 옮겼습니다."));
    expect(screen.getByLabelText("선택 0개, 전체 2개")).toBeTruthy(); // 처리 후 선택이 풀린다
  });

  it("삭제에 실패하면(휴지통 폴더 없음 등) 이유를 알린다", async () => {
    installMail({ remove: vi.fn().mockResolvedValue({ ok: false, error: "휴지통 폴더를 찾을 수 없어 삭제하지 않았습니다." }) });
    renderPage();
    await pick("견적서 송부");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.stringContaining("휴지통 폴더를 찾을 수 없어")));
    expect(notify).not.toHaveBeenCalled();
  });

  it("휴지통에서는 [완전삭제]가 되고, 확인을 받은 뒤에만 서버에서 지운다", async () => {
    const bridge = installMail({ remove: vi.fn().mockResolvedValue({ ok: true, value: { trashed: 0, deleted: 1 } }) });
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPage();
    await screen.findByText("견적서 송부");
    fireEvent.click(screen.getByRole("button", { name: /휴지통/ }));
    await waitFor(() => expect(screen.getByLabelText("현재 폴더").textContent).toBe("휴지통"));
    await pick("견적서 송부");
    const del = screen.getByRole("button", { name: "완전삭제" });
    fireEvent.click(del);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toContain("완전히 삭제");
    expect(bridge.remove).not.toHaveBeenCalled(); // 취소하면 아무것도 지우지 않는다
    fireEvent.click(del);
    await waitFor(() => expect(bridge.remove).toHaveBeenCalledWith([1], true));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("메일 1통을 완전히 삭제했습니다."));
  });

  it("[스팸신고]는 스팸메일함으로 옮긴다. 스팸메일함 안에서는 쓸 수 없다", async () => {
    const bridge = installMail();
    renderPage();
    await pick("회의 안내");
    fireEvent.click(screen.getByRole("button", { name: "스팸신고" }));
    await waitFor(() => expect(bridge.spam).toHaveBeenCalledWith([2]));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("메일 1통을 스팸메일함으로 옮겼습니다."));
    fireEvent.click(screen.getByRole("button", { name: /스팸메일함/ }));
    await waitFor(() => expect(screen.getByLabelText("현재 폴더").textContent).toBe("스팸메일함"));
    await pick("견적서 송부");
    expect((screen.getByRole("button", { name: "스팸신고" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("[이동]은 현재 폴더를 뺀 폴더 목록을 보여 주고, 고른 폴더로 옮긴다", async () => {
    const bridge = installMail();
    renderPage();
    await pick("견적서 송부");
    fireEvent.click(screen.getByRole("button", { name: /이동/ }));
    const menu = await screen.findByRole("menu", { name: "이동할 폴더" });
    const names = within(menu).getAllByRole("menuitem").map((b) => b.textContent);
    expect(names).toEqual(["보낸메일함", "보관함", "스팸메일함", "휴지통"]); // 받은메일함(현재 폴더)은 없다
    fireEvent.click(within(menu).getByRole("menuitem", { name: "보관함" }));
    await waitFor(() => expect(bridge.move).toHaveBeenCalledWith([1], "Archive"));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("메일 1통을 보관함(으)로 옮겼습니다."));
  });

  it("[전달]은 한 통만 골랐을 때만 쓸 수 있고, 그 메일의 전달 쓰기 화면을 연다", async () => {
    const bridge = installMail({ composeDraft: vi.fn().mockResolvedValue({ ok: true, value: { to: "", cc: "", subject: "Fwd: 견적서 송부", body: "전달", attachments: [] } }) });
    renderPage();
    await pick("견적서 송부");
    await pick("회의 안내");
    expect((screen.getByRole("button", { name: "전달" }) as HTMLButtonElement).disabled).toBe(true); // 두 통
    await pick("회의 안내"); // 한 통만 남긴다
    fireEvent.click(screen.getByRole("button", { name: "전달" }));
    await waitFor(() => expect(bridge.composeDraft).toHaveBeenCalledWith("forward", 1));
    expect(await screen.findByRole("form", { name: "메일 쓰기" })).toBeTruthy();
  });

  it("읽기 화면의 [삭제]·[스팸신고]도 같은 동작을 하고 목록으로 돌아간다", async () => {
    const bridge = installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    await screen.findByRole("button", { name: "안 읽음으로 표시" }); // 읽기 화면이 열릴 때까지 (목록 도구줄에도 [삭제]가 있어 먼저 기다린다)
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(bridge.remove).toHaveBeenCalledWith([1], false));
    expect(await screen.findByRole("list", { name: "메일 목록" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "메일 열기: 견적서 송부" }));
    await screen.findByRole("button", { name: "안 읽음으로 표시" });
    fireEvent.click(screen.getByRole("button", { name: "스팸신고" }));
    await waitFor(() => expect(bridge.spam).toHaveBeenCalledWith([1]));
    expect(await screen.findByRole("list", { name: "메일 목록" })).toBeTruthy();
  });
});

describe("서버 본문 검색", () => {
  const search = async (text: string, withBody: boolean) => {
    fireEvent.change(await screen.findByLabelText("메일 검색"), { target: { value: text } });
    if (withBody) fireEvent.click(screen.getByLabelText("본문 포함"));
    fireEvent.submit(screen.getByRole("search"));
  };

  it("[본문 포함]을 켜고 검색하면 서버가 찾은 번호로 목록을 좁힌다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    await search("단가표", true);
    await waitFor(() => expect(bridge.searchBody).toHaveBeenCalledWith("INBOX", "단가표"));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { ids: [2], query: undefined }));
    expect(await screen.findByText("서버에서 본문까지 검색한 결과입니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { ids: undefined, query: undefined }));
  });

  it("[본문 포함]이 꺼져 있으면 서버에 묻지 않고 제목·보낸 사람만 찾는다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    await search("견적", false);
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { query: "견적" }));
    expect(bridge.searchBody).not.toHaveBeenCalled();
  });

  it("서버 검색에 실패하면 제목·보낸 사람 검색으로 대신하고 이유를 알린다", async () => {
    const bridge = installMail({ searchBody: vi.fn().mockResolvedValue({ ok: false, error: "메일 서버에 연결할 수 없습니다." }) });
    renderPage();
    await screen.findByText("견적서 송부");
    await search("단가표", true);
    expect((await screen.findByRole("alert")).textContent).toContain("제목·보낸 사람만 찾았습니다");
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("INBOX", 0, 20, { query: "단가표" }));
  });

  it("폴더를 옮기면 본문 검색 결과(번호)는 풀린다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    await search("단가표", true);
    await screen.findByText("서버에서 본문까지 검색한 결과입니다.");
    fireEvent.click(screen.getByRole("button", { name: /보낸메일함/ }));
    await waitFor(() => expect(bridge.list).toHaveBeenLastCalledWith("Sent", 0, 20, { ids: undefined, query: undefined }));
  });
});

describe("새 메일 신호와 알림", () => {
  it("새 메일 확인으로 목록이 바뀌었다는 신호를 받으면 목록을 다시 읽는다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    const before = (bridge.list as ReturnType<typeof vi.fn>).mock.calls.length;
    await waitFor(() => expect(handlers.changed).toBeTruthy());
    handlers.changed!();
    await waitFor(() => expect((bridge.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before));
  });

  it("알림을 눌러 특정 메일을 열라는 신호를 받으면 그 메일을 연다", async () => {
    const bridge = installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    await waitFor(() => expect(handlers.open).toBeTruthy());
    handlers.open!({ id: 2 });
    await waitFor(() => expect(bridge.get).toHaveBeenCalledWith(2, false));
  });

  it("알림을 눌러 메일 창이 새로 열린 경우(대기 중인 번호)에도 그 메일을 연다", async () => {
    const bridge = installMail({ consumePendingOpen: vi.fn().mockResolvedValue(2) });
    renderPage();
    await waitFor(() => expect(bridge.get).toHaveBeenCalledWith(2, false));
  });

  it("창을 닫을 때(화면이 사라질 때) 신호 받기를 그만둔다", async () => {
    installMail();
    const { unmount } = renderPage();
    await screen.findByText("견적서 송부");
    await waitFor(() => expect(handlers.changed).toBeTruthy());
    unmount();
    expect(handlers.changed).toBeNull();
    expect(handlers.open).toBeNull();
  });
});

describe("문서에서 시작한 메일", () => {
  const pending = {
    draft: { to: "client@cust.co.kr", cc: "", subject: "[견적서] 신제품 개발", body: "담당자님,\n견적서를 보내드립니다.", attachments: [{ id: "doc-1", filename: "견적서_2026-10-01.pdf", size: 4096 }] },
    doc: { type: "project_document" as const, id: 7 },
  };
  const send = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "보내기" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("메일을 보냈습니다."));
  };

  it("메일 창이 새로 열릴 때 넘어온 초안(받는 사람·제목·본문·PDF 첨부)으로 쓰기 화면이 열린다", async () => {
    installMail({ consumePendingCompose: vi.fn().mockResolvedValueOnce(pending).mockResolvedValue(null) });
    renderPage();
    expect(await screen.findByRole("form", { name: "메일 쓰기" })).toBeTruthy();
    expect((screen.getByLabelText("받는사람") as HTMLInputElement).value).toBe("client@cust.co.kr");
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("[견적서] 신제품 개발");
    expect(screen.getByText("견적서_2026-10-01.pdf")).toBeTruthy();
  });

  it("보내면 문서의 발송 이력(받는 사람·제목)을 서버에 알린다", async () => {
    const bridge = installMail({ consumePendingCompose: vi.fn().mockResolvedValueOnce(pending).mockResolvedValue(null) });
    renderPage();
    await send();
    expect(bridge.send).toHaveBeenCalledWith(expect.objectContaining({ to: "client@cust.co.kr", attachmentIds: ["doc-1"] }));
    expect(reportDocumentMailSent).toHaveBeenCalledWith(pending.doc, { to: "client@cust.co.kr", cc: "", bcc: "", subject: "[견적서] 신제품 개발" });
  });

  it("보내기에 실패하면 발송 이력을 남기지 않는다", async () => {
    installMail({ consumePendingCompose: vi.fn().mockResolvedValueOnce(pending).mockResolvedValue(null), send: vi.fn().mockResolvedValue({ ok: false, error: "서버 거절" }) });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "보내기" }));
    expect(await screen.findByText("서버 거절")).toBeTruthy();
    expect(reportDocumentMailSent).not.toHaveBeenCalled();
  });

  it("일반 메일(문서와 무관)은 발송 이력을 남기지 않는다", async () => {
    installMail();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    fireEvent.change(await screen.findByLabelText("받는사람"), { target: { value: "a@t.l" } });
    await send();
    expect(reportDocumentMailSent).not.toHaveBeenCalled();
  });

  it("문서 초안을 보내고 나면 다음 일반 메일에는 이전 문서가 따라가지 않는다", async () => {
    installMail({ consumePendingCompose: vi.fn().mockResolvedValueOnce(pending).mockResolvedValue(null) });
    renderPage();
    await send();
    expect(reportDocumentMailSent).toHaveBeenCalledTimes(1);
    notify.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    fireEvent.change(await screen.findByLabelText("받는사람"), { target: { value: "b@t.l" } });
    await send();
    expect(reportDocumentMailSent).toHaveBeenCalledTimes(1);
  });

  it("메일 창이 이미 열려 있을 때 신호를 받으면 그 초안으로 쓰기 화면을 연다", async () => {
    const consume = vi.fn().mockResolvedValue(null);
    installMail({ consumePendingCompose: consume });
    renderPage();
    await screen.findByText("견적서 송부");
    await waitFor(() => expect(handlers.compose).toBeTruthy());
    consume.mockResolvedValueOnce(pending);
    handlers.compose!();
    expect(await screen.findByRole("form", { name: "메일 쓰기" })).toBeTruthy();
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("[견적서] 신제품 개발");
  });

  it("쓰던 메일을 계속 쓰기로 하면 새 초안의 임시 첨부는 버린다", async () => {
    const consume = vi.fn().mockResolvedValue(null);
    const bridge = installMail({ consumePendingCompose: consume });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "메일쓰기" }));
    fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "쓰던 메일" } });
    confirm.mockResolvedValue(false); // "버릴까요?" → 아니오
    consume.mockResolvedValueOnce(pending);
    handlers.compose!();
    await waitFor(() => expect(bridge.discardAttachments).toHaveBeenCalledWith(["doc-1"]));
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("쓰던 메일");
  });

  it("창을 닫으면 쓰기 신호 받기도 그만둔다", async () => {
    installMail();
    const { unmount } = renderPage();
    await screen.findByText("견적서 송부");
    await waitFor(() => expect(handlers.compose).toBeTruthy());
    unmount();
    expect(handlers.compose).toBeNull();
  });
});

describe("계정 삭제", () => {
  it("확인한 뒤에만 지운다", async () => {
    const bridge = installMail();
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPage();
    await screen.findByText("견적서 송부");
    fireEvent.click(screen.getByRole("button", { name: "메일 계정 설정" }));
    fireEvent.click(await screen.findByRole("button", { name: /계정 정보 삭제/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(bridge.removeAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /계정 정보 삭제/ }));
    await waitFor(() => expect(bridge.removeAccount).toHaveBeenCalledTimes(1));
  });
});
