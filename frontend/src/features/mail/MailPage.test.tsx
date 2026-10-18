// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchClient, MailBridge, MailDetail, MailFolder, MailSummary } from "../../lib/desktop";

const notifyError = vi.fn();
const confirm = vi.fn();
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ notifyError, confirm }) }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { name: "박소장" } }) }));

import { MailPage } from "./MailPage";

const account = { email: "me@bench.co.kr", username: "me@bench.co.kr", imapHost: "imap.daum.net", imapPort: 993, smtpHost: "smtp.daum.net", smtpPort: 465 };
const folders: MailFolder[] = [
  { path: "INBOX", name: "INBOX", specialUse: "\\Inbox", unread: 2, total: 2 },
  { path: "Sent", name: "Sent", specialUse: "\\Sent", unread: 0, total: 0 },
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

function installMail(over: Partial<MailBridge> = {}) {
  const bridge: MailBridge = {
    openWindow: vi.fn().mockResolvedValue(undefined),
    account: vi.fn().mockResolvedValue(account),
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
  notifyError.mockReset();
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
    expect(within(nav).getAllByRole("button").map((b) => b.textContent?.replace(/\d+$/, ""))).toEqual(["전체메일", "받은메일함", "보낸메일함"]);
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

  it("아직 지원하지 않는 버튼(삭제·스팸신고·전달·이동·메일쓰기·내게쓰기)은 눌리지 않는다", async () => {
    installMail();
    renderPage();
    await screen.findByText("견적서 송부");
    for (const name of ["삭제", "스팸신고", "전달", "이동", "메일쓰기", "내게쓰기"]) {
      const b = screen.getByRole("button", { name: new RegExp(name) }) as HTMLButtonElement;
      expect(b.disabled, name).toBe(true);
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
