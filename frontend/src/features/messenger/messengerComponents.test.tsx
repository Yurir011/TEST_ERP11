// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { ConversationList } from "./ConversationList";
import { MessageBubble, MessageText, PendingBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { NewConversationModal } from "./NewConversationModal";
import type { ChatMessage, ConversationSummary, MessengerUser } from "./types";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), downloadFile: vi.fn(), openFile: vi.fn() }));
vi.mock("../../lib/api", () => ({
  ...api,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));
afterEach(cleanup);

// ── MessageInput ───────────────────────────────────────────────────

describe("MessageInput", () => {
  const box = () => screen.getByLabelText("메시지 입력") as HTMLTextAreaElement;

  it("Enter 로 보내고 입력칸을 비운다 (앞뒤 공백은 제거)", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onAttach={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "  안녕하세요  " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("안녕하세요");
    expect(box().value).toBe("");
  });

  it("Shift+Enter 는 줄바꿈이므로 보내지 않는다", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onAttach={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "첫 줄" } });
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(box().value).toBe("첫 줄");
  });

  it("한글 조합 중의 Enter 는 보내지 않는다 (마지막 글자 중복·잘림 방지)", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onAttach={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "안녕하세" } });
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(box(), { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("빈 글이나 공백만 있으면 보내지 않고 [보내기]도 꺼져 있다", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onAttach={vi.fn()} />);
    expect((screen.getByLabelText("보내기") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "   \n " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("[보내기] 버튼으로도 보낸다", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onAttach={vi.fn()} />);
    fireEvent.change(box(), { target: { value: "버튼" } });
    fireEvent.click(screen.getByLabelText("보내기"));
    expect(onSend).toHaveBeenCalledWith("버튼");
  });

  it("파일을 고르면 알리고, 같은 파일을 다시 고를 수 있게 비운다", () => {
    const onAttach = vi.fn();
    render(<MessageInput onSend={vi.fn()} onAttach={onAttach} />);
    const input = screen.getByLabelText("첨부할 파일") as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAttach).toHaveBeenCalledWith(file);
  });

  it("<form> 안에 있지 않다 (앱 전체의 Enter=다음 칸 규칙과 부딪히지 않는다)", () => {
    render(<MessageInput onSend={vi.fn()} onAttach={vi.fn()} />);
    expect(box().form).toBeNull();
  });

  it("disabled 이면 보낼 수 없다", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} onAttach={vi.fn()} disabled />);
    expect(box().disabled).toBe(true);
  });
});

// ── MessageBubble ──────────────────────────────────────────────────

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 1, conversation_id: 1, sender_id: 2, sender_name: "홍길동", body: "안녕", created_at: "2026-10-17T10:05:00", client_msg_id: null, attachments: [], ...over,
});

function renderBubble(m: ChatMessage, extra: Partial<Parameters<typeof MessageBubble>[0]> = {}) {
  return render(
    <DialogProvider>
      <MessageBubble message={m} mine={false} showSender showTime unreadCount={0} {...extra} />
    </DialogProvider>,
  );
}

describe("MessageBubble", () => {
  it("보낸 사람 이름(남의 메시지)과 시각을 보여 준다", () => {
    renderBubble(msg());
    expect(screen.getByText("홍길동")).toBeTruthy();
    expect(screen.getByText("10:05")).toBeTruthy();
  });

  it("같은 사람의 이어진 메시지는 이름을 생략하고, 시각은 묶음의 마지막에만", () => {
    renderBubble(msg(), { showSender: false, showTime: false });
    expect(screen.queryByText("홍길동")).toBeNull();
    expect(screen.queryByText("10:05")).toBeNull();
  });

  it("아직 읽지 않은 사람이 있으면 숫자로 보여 주고, 모두 읽었으면(0) 숫자를 숨긴다", () => {
    const { unmount } = renderBubble(msg({ sender_id: 1 }), { mine: true, unreadCount: 2 });
    expect(screen.getByLabelText("아직 읽지 않은 사람 2명").textContent).toBe("2");
    unmount();
    renderBubble(msg({ sender_id: 1 }), { mine: true, unreadCount: 0 });
    expect(screen.queryByLabelText(/아직 읽지 않은 사람/)).toBeNull();
  });

  it("남이 보낸 메시지에도 숫자가 붙는다", () => {
    renderBubble(msg(), { mine: false, unreadCount: 1 });
    expect(screen.getByLabelText("아직 읽지 않은 사람 1명").textContent).toBe("1");
  });

  it("글 안의 HTML 은 요소가 되지 않고 글자 그대로 보인다", () => {
    const { container } = render(<MessageText text={'<img src=x onerror="alert(1)"><script>alert(1)</script>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("http(s) 주소만 링크, 새 창으로 열며 opener 를 막는다. javascript: 는 링크가 아니다", () => {
    const { container } = render(<MessageText text={"문서 https://example.com/a.pdf 와 javascript:alert(1)"} />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://example.com/a.pdf");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toContain("noopener");
  });

  it("줄바꿈이 유지된다", () => {
    const { container } = render(<MessageText text={"첫 줄\n둘째 줄"} />);
    expect(container.firstElementChild?.className).toContain("whitespace-pre-wrap");
  });

  it("PDF 는 열기, 오피스 문서 등은 다운로드로 처리한다", async () => {
    api.openFile.mockResolvedValue(undefined);
    api.downloadFile.mockResolvedValue(undefined);
    const att = (id: number, name: string, type: string) => ({ id, file_name: name, size: 2048, content_type: type });
    const { unmount } = renderBubble(msg({ attachments: [att(7, "견적서.pdf", "application/pdf")] }));
    fireEvent.click(screen.getByTitle("열기"));
    await waitFor(() => expect(api.openFile).toHaveBeenCalledWith("/api/messenger/attachments/7"));
    unmount();

    renderBubble(msg({ attachments: [att(8, "자료.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")] }));
    fireEvent.click(screen.getByTitle("다운로드"));
    await waitFor(() => expect(api.downloadFile).toHaveBeenCalledWith("/api/messenger/attachments/8", "자료.docx"));
    expect(api.openFile).toHaveBeenCalledTimes(1); // 문서는 화면에서 열지 않는다
  });

  it("SVG·HTML 은 이미지로 그리지 않고 다운로드 버튼으로만 보인다", () => {
    const att = { id: 9, file_name: "x.svg", size: 10, content_type: "image/svg+xml" };
    renderBubble(msg({ attachments: [att] }));
    expect(screen.getByTitle("다운로드")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("PendingBubble", () => {
  const base = { clientMsgId: "aaaaaaaa", body: "보내는 글", failed: false, createdAt: "" };

  it("보내는 중", () => {
    render(<PendingBubble p={base} onRetry={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText("보내는 중...")).toBeTruthy();
    expect(screen.queryByText("다시 보내기")).toBeNull();
  });

  it("실패하면 이유와 [다시 보내기]·[삭제]", () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(<PendingBubble p={{ ...base, failed: true, error: "연결을 확인하세요" }} onRetry={onRetry} onDiscard={onDiscard} />);
    expect(screen.getByRole("alert").textContent).toContain("연결을 확인하세요");
    fireEvent.click(screen.getByText("다시 보내기"));
    fireEvent.click(screen.getByText("삭제"));
    expect(onRetry).toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalled();
  });
});

// ── ConversationList ───────────────────────────────────────────────

const conv = (id: number, over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id, kind: "direct", title: `상대${id}`, members: [], last_message: { id: 1, sender_id: 2, sender_name: "상대", preview: "마지막 글", has_attachment: false, created_at: "2026-10-17T10:00:00" },
  unread_count: 0, muted: false, created_at: "2026-10-01T00:00:00", last_message_at: "2026-10-17T10:00:00", ...over,
});

describe("ConversationList", () => {
  it("불러오는 중 / 비어 있음 안내", () => {
    const { rerender } = render(<ConversationList conversations={null} activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("불러오는 중...")).toBeTruthy();
    rerender(<ConversationList conversations={[]} activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText(/대화가 없습니다/)).toBeTruthy();
  });

  it("제목·마지막 글·안 읽은 수를 보여 주고 누르면 선택한다", () => {
    const onSelect = vi.fn();
    render(<ConversationList conversations={[conv(1, { unread_count: 3 }), conv(2)]} activeId={2} onSelect={onSelect} onNew={vi.fn()} />);
    expect(screen.getByLabelText("안 읽은 메시지 3개")).toBeTruthy();
    expect(screen.getAllByText("마지막 글")).toHaveLength(2);
    fireEvent.click(screen.getByText("상대1"));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.getByText("상대2").closest("button")?.getAttribute("aria-current")).toBe("true");
  });

  it("그룹은 보낸 사람 이름을 앞에 붙이고, 99개 넘으면 99+", () => {
    render(<ConversationList conversations={[conv(1, { kind: "group", title: "프로젝트방", unread_count: 150, members: [{ id: 1, name: "가", last_read_message_id: null }] })]} activeId={null} onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText("상대: 마지막 글")).toBeTruthy();
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("[새 대화] 버튼", () => {
    const onNew = vi.fn();
    render(<ConversationList conversations={[]} activeId={null} onSelect={vi.fn()} onNew={onNew} />);
    fireEvent.click(screen.getByRole("button", { name: /새 대화/ }));
    expect(onNew).toHaveBeenCalled();
  });
});

// ── NewConversationModal ───────────────────────────────────────────

const users: MessengerUser[] = [
  { id: 2, name: "김영희", grade: "staff", title: null },
  { id: 3, name: "이철수", grade: "manager", title: "team_lead" },
  { id: 4, name: "박민수", grade: "staff", title: null },
];

describe("NewConversationModal", () => {
  beforeEach(() => {
    api.apiGet.mockResolvedValue(users); // (값을 돌려주면 vitest 가 정리 함수로 호출하므로 중괄호로 감싼다)
  });
  const check = async (name: string) => fireEvent.click(await screen.findByLabelText(new RegExp(name)));

  it("한 명을 고르면 1:1 대화로 만든다", async () => {
    api.apiPost.mockResolvedValue({ id: 55 });
    const onDone = vi.fn();
    render(<NewConversationModal mode="create" onClose={vi.fn()} onDone={onDone} />);
    await check("김영희");
    expect(screen.queryByLabelText("그룹 대화 이름")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "대화 시작" }));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/messenger/conversations", { kind: "direct", member_ids: [2], title: null }));
    expect(onDone).toHaveBeenCalledWith(55);
  });

  it("두 명 이상이면 그룹 이름이 있어야 만들 수 있다", async () => {
    api.apiPost.mockResolvedValue({ id: 56 });
    render(<NewConversationModal mode="create" onClose={vi.fn()} onDone={vi.fn()} />);
    await check("김영희");
    await check("이철수");
    const submit = screen.getByRole("button", { name: "그룹 대화 만들기" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("그룹 대화 이름"), { target: { value: " 프로젝트방 " } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/messenger/conversations", { kind: "group", member_ids: [2, 3], title: "프로젝트방" }));
  });

  it("아무도 고르지 않으면 시작할 수 없고, 이름으로 찾을 수 있다", async () => {
    render(<NewConversationModal mode="create" onClose={vi.fn()} onDone={vi.fn()} />);
    expect((await screen.findByRole("button", { name: "대화 시작" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("이름 검색"), { target: { value: "철" } });
    expect(screen.queryByText("김영희")).toBeNull();
    expect(screen.getByText("이철수")).toBeTruthy();
  });

  it("참여자 추가 모드: 이미 참여 중인 직원은 목록에 없고 선택한 사람만 보낸다", async () => {
    api.apiPost.mockResolvedValue({});
    const onDone = vi.fn();
    const conversation = conv(9, { kind: "group", members: [{ id: 2, name: "김영희", last_read_message_id: null }] });
    render(<NewConversationModal mode="add" conversation={conversation} onClose={vi.fn()} onDone={onDone} />);
    await screen.findByText("이철수");
    expect(screen.queryByText("김영희")).toBeNull();
    await check("박민수");
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/messenger/conversations/9/members", { user_ids: [4] }));
    expect(onDone).toHaveBeenCalledWith(9);
  });

  it("서버가 거절하면 그 문구를 보여 주고 닫지 않는다", async () => {
    const { ApiError } = await import("../../lib/api");
    api.apiPost.mockRejectedValue(new ApiError(400, "대화 상대를 찾을 수 없거나 사용할 수 없는 계정입니다."));
    const onDone = vi.fn();
    render(<NewConversationModal mode="create" onClose={vi.fn()} onDone={onDone} />);
    await check("김영희");
    fireEvent.click(screen.getByRole("button", { name: "대화 시작" }));
    expect((await screen.findByRole("alert")).textContent).toContain("사용할 수 없는 계정");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("직원 목록을 못 받으면 안내", async () => {
    api.apiGet.mockRejectedValue(new Error("x"));
    render(<NewConversationModal mode="create" onClose={vi.fn()} onDone={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("직원 목록을 불러오지 못했습니다");
  });
});
