// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { MessageThread } from "./MessageThread";
import type { ChatMessage, ConversationSummary, RealtimeEvent } from "./types";
import { MessengerContext, type MessengerContextValue } from "./useMessenger";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(), apiUploadForm: vi.fn(), downloadFile: vi.fn(), openFile: vi.fn() }));
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

const ME = 1;
const CID = 10;
const NEWEST_URL = `/api/messenger/conversations/${CID}/messages?limit=50`;

const msg = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversation_id: CID, sender_id: 2, sender_name: "김영희", body: `메시지 ${id}`,
  created_at: `2026-10-17T10:${String(id).padStart(2, "0")}:00`, client_msg_id: null, attachments: [], ...over,
});

const conversation = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: CID, kind: "direct", title: "김영희",
  members: [{ id: ME, name: "나", last_read_message_id: 0 }, { id: 2, name: "김영희", last_read_message_id: null }],
  last_message: null, unread_count: 0, muted: false, created_at: "2026-10-01T00:00:00", last_message_at: null, ...over,
});

function makeCtx(over: Partial<MessengerContextValue> = {}) {
  const listeners = new Set<(e: RealtimeEvent) => void>();
  const value: MessengerContextValue = {
    conversations: [], unreadTotal: 0, connection: { state: "connected", epoch: 1 },
    refresh: vi.fn().mockResolvedValue(undefined),
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    setActiveConversation: vi.fn(),
    directory: null, myStatus: null, ensureDirectory: vi.fn(),
    changeMyStatus: vi.fn().mockResolvedValue(undefined), toggleFavorite: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return { value, emit: (e: RealtimeEvent) => act(() => { listeners.forEach((l) => l(e)); }) };
}

function Wrap({ ctx, children }: { ctx: MessengerContextValue; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[`/messenger/${CID}`]}>
      <DialogProvider>
        <MessengerContext.Provider value={ctx}>
          <Routes>
            <Route path="/messenger/:conversationId" element={children} />
            <Route path="/messenger" element={<p>목록 화면</p>} />
          </Routes>
        </MessengerContext.Provider>
      </DialogProvider>
    </MemoryRouter>
  );
}

function setup(opts: { conv?: ConversationSummary; page?: { messages: ChatMessage[]; has_more: boolean }; ctx?: Partial<MessengerContextValue> } = {}) {
  const ctx = makeCtx(opts.ctx);
  api.apiGet.mockImplementation(async (url: string) => (url === NEWEST_URL ? (opts.page ?? { messages: [], has_more: false }) : { messages: [], has_more: false }));
  const conv = opts.conv ?? conversation();
  const view = render(<Wrap ctx={ctx.value}><MessageThread conversation={conv} meId={ME} /></Wrap>);
  return { ...ctx, view, conv, rerenderWith: (value: MessengerContextValue, c = conv) => view.rerender(<Wrap ctx={value}><MessageThread conversation={c} meId={ME} /></Wrap>) };
}

let viewing = true;
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.apiPut.mockResolvedValue({});
  viewing = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.spyOn(document, "hasFocus").mockImplementation(() => viewing);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const box = () => screen.getByLabelText("메시지 입력") as HTMLTextAreaElement;
const type = (text: string) => {
  fireEvent.change(box(), { target: { value: text } });
  fireEvent.keyDown(box(), { key: "Enter" });
};

describe("불러오기와 표시", () => {
  it("열면 최근 50개를 받아 오래된 것부터 보여 주고 날짜 줄을 넣는다", async () => {
    setup({ page: { messages: [msg(1), msg(2, { sender_id: ME, sender_name: "나" })], has_more: false } });
    expect(await screen.findByText("메시지 1")).toBeTruthy();
    expect(screen.getByText("메시지 2")).toBeTruthy();
    expect(screen.getByText(/2026년 10월 17일/)).toBeTruthy();
    expect(api.apiGet).toHaveBeenCalledWith(NEWEST_URL);
  });

  it("메시지가 없으면 안내", async () => {
    setup();
    expect(await screen.findByText(/아직 메시지가 없습니다/)).toBeTruthy();
  });

  it("불러오지 못하면 서버 문구 또는 기본 안내", async () => {
    const ctx = makeCtx();
    api.apiGet.mockRejectedValue(new Error("x"));
    render(<Wrap ctx={ctx.value}><MessageThread conversation={conversation()} meId={ME} /></Wrap>);
    expect(await screen.findByText("메시지를 불러오지 못했습니다.")).toBeTruthy();
  });

  it("그룹에서는 남의 메시지에 보낸 사람 이름이 보이고 1:1 에서는 보이지 않는다", async () => {
    const page = { messages: [msg(1)], has_more: false };
    const { view } = setup({ conv: conversation({ kind: "group", title: "프로젝트방" }), page });
    await screen.findByText("메시지 1");
    expect(screen.getAllByText("김영희").length).toBeGreaterThan(0);
    view.unmount();
    cleanup();
    setup({ page });
    await screen.findByText("메시지 1");
    expect(screen.queryByText("김영희", { selector: "span.text-xs" })).toBeNull();
  });

  it("대화방이 열려 있음을 알리고 닫으면 해제한다", async () => {
    const { value, view } = setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    expect(value.setActiveConversation).toHaveBeenCalledWith(CID);
    view.unmount();
    expect(value.setActiveConversation).toHaveBeenLastCalledWith(null);
  });

  it("실시간 연결이 끊겨 있으면 안내하되 보낼 수는 있다", async () => {
    setup({ ctx: { connection: { state: "disconnected", epoch: 1 } } });
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(box().disabled).toBe(false);
  });
});

describe("실시간 새 메시지", () => {
  it("이 대화방의 새 메시지는 붙이고, 같은 메시지가 또 와도 한 번만, 다른 대화방 것은 무시", async () => {
    const { emit } = setup({ page: { messages: [msg(1)], has_more: false } });
    await screen.findByText("메시지 1");
    emit({ type: "message.created", message: msg(2) });
    emit({ type: "message.created", message: msg(2) });
    emit({ type: "message.created", message: msg(3, { conversation_id: 99 }) });
    expect(await screen.findByText("메시지 2")).toBeTruthy();
    expect(screen.getAllByText("메시지 2")).toHaveLength(1);
    expect(screen.queryByText("메시지 3")).toBeNull();
  });

  it("처음 불러오는 동안 먼저 도착한 메시지도 잃지 않는다", async () => {
    let resolve!: (v: unknown) => void;
    api.apiGet.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const ctx = makeCtx();
    render(<Wrap ctx={ctx.value}><MessageThread conversation={conversation()} meId={ME} /></Wrap>);
    ctx.emit({ type: "message.created", message: msg(5, { body: "도중에 도착" }) });
    resolve({ messages: [msg(1), msg(4)], has_more: false });
    expect(await screen.findByText("도중에 도착")).toBeTruthy();
    expect(screen.getByText("메시지 1")).toBeTruthy();
  });

  it("다시 연결되면 그 사이 놓친 메시지를 마지막 번호 이후로 받아 합친다", async () => {
    const ctx0 = makeCtx();
    const { rerenderWith } = setup({ page: { messages: [msg(1), msg(2)], has_more: false }, ctx: ctx0.value });
    await screen.findByText("메시지 2");
    api.apiGet.mockImplementation(async (url: string) => (url.includes("after_id=2") ? { messages: [msg(3, { body: "놓친 메시지" })], has_more: false } : { messages: [], has_more: false }));
    rerenderWith({ ...ctx0.value, connection: { state: "connected", epoch: 2 } });
    expect(await screen.findByText("놓친 메시지")).toBeTruthy();
    expect(api.apiGet).toHaveBeenCalledWith(`/api/messenger/conversations/${CID}/messages?after_id=2`);
  });

  it("연결 상태만 바뀌고 epoch 가 같으면 다시 받지 않는다", async () => {
    const ctx0 = makeCtx();
    const { rerenderWith } = setup({ page: { messages: [msg(1)], has_more: false }, ctx: ctx0.value });
    await screen.findByText("메시지 1");
    const calls = api.apiGet.mock.calls.length;
    rerenderWith({ ...ctx0.value, connection: { state: "disconnected", epoch: 1 } });
    await Promise.resolve();
    expect(api.apiGet.mock.calls.length).toBe(calls);
  });
});

describe("보내기", () => {
  it("Enter 로 보내면 '보내는 중'으로 먼저 보이고 저장되면 일반 메시지로 바뀐다 (client_msg_id 와 함께)", async () => {
    let finish!: (m: ChatMessage) => void;
    api.apiPost.mockImplementation(() => new Promise((r) => { finish = r; }));
    setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    type("안녕하세요");
    expect(await screen.findByText("보내는 중...")).toBeTruthy();
    const [url, body] = api.apiPost.mock.calls[0];
    expect(url).toBe(`/api/messenger/conversations/${CID}/messages`);
    expect(body.body).toBe("안녕하세요");
    expect(body.client_msg_id).toMatch(/^[0-9A-Za-z-]{8,36}$/);

    await act(async () => finish(msg(7, { sender_id: ME, sender_name: "나", body: "안녕하세요", client_msg_id: body.client_msg_id })));
    await waitFor(() => expect(screen.queryByText("보내는 중...")).toBeNull());
    expect(screen.getAllByText("안녕하세요")).toHaveLength(1);
  });

  it("저장 응답보다 실시간 알림이 먼저 와도 한 번만 보인다", async () => {
    let finish!: (m: ChatMessage) => void;
    api.apiPost.mockImplementation(() => new Promise((r) => { finish = r; }));
    const { emit } = setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    type("중복 시험");
    await screen.findByText("보내는 중...");
    const cid = api.apiPost.mock.calls[0][1].client_msg_id;
    const saved = msg(8, { sender_id: ME, sender_name: "나", body: "중복 시험", client_msg_id: cid });
    emit({ type: "message.created", message: saved });
    await waitFor(() => expect(screen.queryByText("보내는 중...")).toBeNull());
    await act(async () => finish(saved));
    expect(screen.getAllByText("중복 시험")).toHaveLength(1);
  });

  it("실패하면 이유와 함께 남고, [다시 보내기]는 같은 client_msg_id 로 보낸다", async () => {
    const { ApiError } = await import("../../lib/api");
    api.apiPost.mockRejectedValueOnce(new ApiError(500, "서버 오류")).mockImplementation(async (_u: string, b: { body: string; client_msg_id: string }) => msg(9, { sender_id: ME, body: b.body, client_msg_id: b.client_msg_id }));
    setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    type("재시도 시험");
    expect((await screen.findByRole("alert")).textContent).toContain("서버 오류");
    fireEvent.click(screen.getByText("다시 보내기"));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(api.apiPost).toHaveBeenCalledTimes(2);
    expect(api.apiPost.mock.calls[1][1].client_msg_id).toBe(api.apiPost.mock.calls[0][1].client_msg_id);
    expect(await screen.findAllByText("재시도 시험")).toHaveLength(1);
  });

  it("실패한 메시지는 지울 수 있다", async () => {
    api.apiPost.mockRejectedValue(new Error("network"));
    setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    type("지울 글");
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("삭제"));
    expect(screen.queryByText("지울 글")).toBeNull();
  });
});

describe("파일 보내기", () => {
  // 파일을 고른 뒤 [보내기]를 눌러야 전송된다
  const attach = (file: File) => {
    fireEvent.change(screen.getByLabelText("첨부할 파일"), { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText("보내기"));
  };

  it("20MB 가 넘으면 서버로 보내지 않고 안내한다", async () => {
    setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    const big = new File(["x"], "큰파일.zip", { type: "application/zip" });
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    attach(big);
    expect(await screen.findByText(/20\.0MB를 넘을 수 없습니다/)).toBeTruthy();
    expect(api.apiUploadForm).not.toHaveBeenCalled();
  });

  it("파일과 client_msg_id 를 폼으로 보낸다", async () => {
    api.apiUploadForm.mockResolvedValue(msg(11, { sender_id: ME, attachments: [{ id: 1, file_name: "a.pdf", size: 3, content_type: "application/pdf" }], body: "" }));
    setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    const file = new File(["abc"], "a.pdf", { type: "application/pdf" });
    attach(file);
    await waitFor(() => expect(api.apiUploadForm).toHaveBeenCalled());
    const [url, form] = api.apiUploadForm.mock.calls[0] as [string, FormData];
    expect(url).toBe(`/api/messenger/conversations/${CID}/attachments`);
    expect((form.get("file") as File).name).toBe("a.pdf");
    expect(String(form.get("client_msg_id"))).toMatch(/^[0-9A-Za-z-]{8,36}$/);
    expect(await screen.findByText("a.pdf")).toBeTruthy();
  });

  it("서버가 거절하면(형식 등) 그 문구와 함께 실패로 남는다", async () => {
    const { ApiError } = await import("../../lib/api");
    api.apiUploadForm.mockRejectedValue(new ApiError(400, "지원하지 않는 파일 형식입니다."));
    setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    attach(new File(["x"], "x.exe", { type: "application/octet-stream" }));
    expect((await screen.findByRole("alert")).textContent).toContain("지원하지 않는 파일 형식입니다.");
  });
});

describe("보낸 메시지 삭제", () => {
  const deletedOf = (m: ChatMessage): ChatMessage => ({ ...m, body: "", attachments: [], deleted_at: "2026-10-20T10:00:00" });

  it("내 메시지에만 삭제 버튼이 있고, 확인하면 서버에 지우고 \"삭제된 메시지입니다\"로 바뀐다", async () => {
    const mine = msg(2, { sender_id: ME, sender_name: "나", body: "내 글" });
    api.apiDelete.mockResolvedValue(deletedOf(mine));
    setup({ page: { messages: [msg(1), mine], has_more: false } });
    await screen.findByText("내 글");
    expect(screen.getAllByLabelText("메시지 삭제")).toHaveLength(1); // 남의 메시지에는 없다

    fireEvent.click(screen.getByLabelText("메시지 삭제"));
    fireEvent.click(await screen.findByRole("button", { name: "삭제" })); // 확인 창
    await waitFor(() => expect(api.apiDelete).toHaveBeenCalledWith(`/api/messenger/conversations/${CID}/messages/2`));
    expect(await screen.findByText("삭제된 메시지입니다.")).toBeTruthy();
    expect(screen.queryByText("내 글")).toBeNull();
    expect(screen.queryByLabelText("메시지 삭제")).toBeNull();
  });

  it("확인 창에서 취소하면 지우지 않는다", async () => {
    setup({ page: { messages: [msg(2, { sender_id: ME, sender_name: "나", body: "내 글" })], has_more: false } });
    await screen.findByText("내 글");
    fireEvent.click(screen.getByLabelText("메시지 삭제"));
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    expect(api.apiDelete).not.toHaveBeenCalled();
    expect(screen.getByText("내 글")).toBeTruthy();
  });

  it("상대가 지운 메시지는 실시간 알림으로 \"삭제된 메시지입니다\"로 바뀐다", async () => {
    const theirs = msg(1, { body: "곧 지워질 글" });
    const { emit } = setup({ page: { messages: [theirs], has_more: false } });
    await screen.findByText("곧 지워질 글");
    emit({ type: "message.deleted", message: deletedOf(theirs) });
    expect(await screen.findByText("삭제된 메시지입니다.")).toBeTruthy();
    expect(screen.queryByText("곧 지워질 글")).toBeNull();
  });

  it("삭제에 실패하면 안내하고 메시지는 그대로 둔다", async () => {
    const { ApiError } = await import("../../lib/api");
    api.apiDelete.mockRejectedValue(new ApiError(403, "내가 보낸 메시지만 삭제할 수 있습니다."));
    setup({ page: { messages: [msg(2, { sender_id: ME, sender_name: "나", body: "내 글" })], has_more: false } });
    await screen.findByText("내 글");
    fireEvent.click(screen.getByLabelText("메시지 삭제"));
    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    expect(await screen.findByText(/내가 보낸 메시지만 삭제할 수 있습니다/)).toBeTruthy();
    expect(screen.getByText("내 글")).toBeTruthy();
  });
});

describe("읽음 표시", () => {
  const readUrl = `/api/messenger/conversations/${CID}/read`;

  it("보고 있는 동안 가장 최근 메시지까지 읽었다고 서버에 알린다 (같은 위치는 다시 보내지 않는다)", async () => {
    const { emit } = setup({ page: { messages: [msg(1), msg(2)], has_more: false } });
    await screen.findByText("메시지 2");
    await waitFor(() => expect(api.apiPut).toHaveBeenCalledWith(readUrl, { message_id: 2 }));
    emit({ type: "message.created", message: msg(3) });
    await waitFor(() => expect(api.apiPut).toHaveBeenCalledWith(readUrl, { message_id: 3 }));
    expect(api.apiPut.mock.calls.filter((c) => c[1].message_id === 2)).toHaveLength(1);
  });

  it("창을 보고 있지 않으면 읽었다고 알리지 않고, 다시 보면 알린다", async () => {
    viewing = false;
    setup({ page: { messages: [msg(1)], has_more: false } });
    await screen.findByText("메시지 1");
    await Promise.resolve();
    expect(api.apiPut).not.toHaveBeenCalled();
    viewing = true;
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(api.apiPut).toHaveBeenCalledWith(readUrl, { message_id: 1 }));
  });

  it("이미 읽은 위치까지면 보내지 않는다", async () => {
    const conv = conversation({ members: [{ id: ME, name: "나", last_read_message_id: 2 }, { id: 2, name: "김영희", last_read_message_id: null }] });
    setup({ conv, page: { messages: [msg(1), msg(2)], has_more: false } });
    await screen.findByText("메시지 2");
    await Promise.resolve();
    expect(api.apiPut).not.toHaveBeenCalled();
  });

  it("1:1: 내 메시지에는 상대가 아직 안 읽은 만큼 1 이 붙고, 상대가 읽으면 사라진다 (카카오톡처럼)", async () => {
    const page = { messages: [msg(1, { sender_id: ME, sender_name: "나" }), msg(2, { sender_id: ME, sender_name: "나" })], has_more: false };
    const ctx0 = makeCtx();
    const unread = conversation({ members: [{ id: ME, name: "나", last_read_message_id: 2 }, { id: 2, name: "김영희", last_read_message_id: null }] });
    const { rerenderWith } = setup({ conv: unread, page, ctx: ctx0.value });
    await screen.findByText("메시지 2");
    expect(screen.getAllByLabelText("아직 읽지 않은 사람 1명")).toHaveLength(2); // 두 메시지 모두 아직 안 읽음

    // 상대가 1번까지 읽음 (대화방 목록의 참여자 정보가 갱신되어 다시 그려진다)
    rerenderWith(ctx0.value, conversation({ members: [{ id: ME, name: "나", last_read_message_id: 2 }, { id: 2, name: "김영희", last_read_message_id: 1 }] }));
    await waitFor(() => expect(screen.getAllByLabelText("아직 읽지 않은 사람 1명")).toHaveLength(1));
    // 2번까지 읽음 → 숫자가 모두 사라진다
    rerenderWith(ctx0.value, conversation({ members: [{ id: ME, name: "나", last_read_message_id: 2 }, { id: 2, name: "김영희", last_read_message_id: 2 }] }));
    await waitFor(() => expect(screen.queryByLabelText(/아직 읽지 않은 사람/)).toBeNull());
  });

  it("그룹: 아직 읽지 않은 사람 수가 메시지마다 붙고, 읽는 사람이 늘수록 줄어든다 (남의 메시지에도)", async () => {
    const members = (a: number | null, b: number | null) => [
      { id: ME, name: "나", last_read_message_id: 3 }, { id: 2, name: "김영희", last_read_message_id: a }, { id: 3, name: "이철수", last_read_message_id: b },
    ];
    const page = { messages: [msg(1, { sender_id: ME, sender_name: "나" }), msg(2, { sender_id: 2 }), msg(3, { sender_id: ME, sender_name: "나" })], has_more: false };
    const ctx0 = makeCtx();
    const group = (a: number | null, b: number | null) => conversation({ kind: "group", title: "프로젝트방", members: members(a, b) });
    const { rerenderWith } = setup({ conv: group(2, null), page, ctx: ctx0.value });
    await screen.findByText("메시지 3");
    const counts = () => screen.getAllByLabelText(/^아직 읽지 않은 사람/).map((e) => e.textContent);
    // 메시지1(내 것): 김영희는 읽음, 이철수는 안 읽음 → 1 / 메시지2(김영희 것): 나는 읽음, 이철수 안 읽음 → 1 / 메시지3(내 것): 둘 다 아직 → 2
    expect(counts()).toEqual(["1", "1", "2"]);
    rerenderWith(ctx0.value, group(3, 2));
    await waitFor(() => expect(counts()).toEqual(["1"])); // 김영희는 3까지, 이철수는 2까지 읽음 → 메시지3 만 이철수가 아직
    rerenderWith(ctx0.value, group(3, 3));
    await waitFor(() => expect(screen.queryByLabelText(/아직 읽지 않은 사람/)).toBeNull());
  });

  it("읽기 알림이 실패하면 다음에 다시 시도한다", async () => {
    api.apiPut.mockRejectedValueOnce(new Error("net")).mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { emit } = setup({ page: { messages: [msg(1)], has_more: false } });
    await screen.findByText("메시지 1");
    await waitFor(() => expect(api.apiPut).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    emit({ type: "message.created", message: msg(2) });
    await waitFor(() => expect(api.apiPut).toHaveBeenLastCalledWith(readUrl, { message_id: 2 }));
  });
});

describe("이전 메시지", () => {
  it("[이전 메시지 더 보기]로 더 오래된 것을 위에 붙이고, 더 없으면 버튼이 사라진다", async () => {
    setup({ page: { messages: [msg(11), msg(12)], has_more: true } });
    await screen.findByText("메시지 12");
    api.apiGet.mockImplementation(async (url: string) => (url.includes("before_id=11") ? { messages: [msg(9), msg(10)], has_more: false } : { messages: [], has_more: false }));
    fireEvent.click(screen.getByText("이전 메시지 더 보기"));
    expect(await screen.findByText("메시지 9")).toBeTruthy();
    expect(api.apiGet).toHaveBeenCalledWith(`/api/messenger/conversations/${CID}/messages?limit=50&before_id=11`);
    expect(screen.queryByText("이전 메시지 더 보기")).toBeNull();
    const texts = screen.getAllByText(/^메시지 \d+$/).map((e) => e.textContent);
    expect(texts).toEqual(["메시지 9", "메시지 10", "메시지 11", "메시지 12"]);
  });
});

describe("대화방 설정", () => {
  it("1:1 에는 참여자 추가·나가기가 없고 알림 끄기만 있다", async () => {
    setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    expect(screen.queryByLabelText("참여자 추가")).toBeNull();
    expect(screen.queryByLabelText("대화방 나가기")).toBeNull();
    expect(screen.getByLabelText("알림 끄기")).toBeTruthy();
  });

  it("알림 끄기는 서버에 저장하고 목록을 다시 받는다", async () => {
    api.apiPut.mockResolvedValue({});
    const { value } = setup();
    await screen.findByText(/아직 메시지가 없습니다/);
    fireEvent.click(screen.getByLabelText("알림 끄기"));
    await waitFor(() => expect(api.apiPut).toHaveBeenCalledWith(`/api/messenger/conversations/${CID}/mute`, { muted: true }));
    await waitFor(() => expect(value.refresh).toHaveBeenCalled());
  });

  it("그룹: 참여자 목록, 추가 창, 나가기(확인 후 서버에 알리고 목록 화면으로)", async () => {
    api.apiDelete.mockResolvedValue(undefined);
    const conv = conversation({ kind: "group", title: "프로젝트방", members: [{ id: ME, name: "나", last_read_message_id: null }, { id: 2, name: "김영희", last_read_message_id: null }, { id: 3, name: "이철수", last_read_message_id: null }] });
    const { value } = setup({ conv });
    await screen.findByText(/아직 메시지가 없습니다/);
    expect(screen.getByText(/참여자 3명: 김영희, 나, 이철수|참여자 3명: 나, 김영희, 이철수/)).toBeTruthy();

    api.apiGet.mockImplementation(async (url: string) => (url === "/api/messenger/users" ? [] : { messages: [], has_more: false }));
    fireEvent.click(screen.getByLabelText("참여자 추가"));
    expect(await screen.findByRole("dialog", { name: "참여자 추가" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("닫기"));

    fireEvent.click(screen.getByLabelText("대화방 나가기"));
    expect(api.apiDelete).not.toHaveBeenCalled(); // 확인 전에는 나가지 않는다
    fireEvent.click(await screen.findByRole("button", { name: "나가기" }));
    await waitFor(() => expect(api.apiDelete).toHaveBeenCalledWith(`/api/messenger/conversations/${CID}/members/me`));
    expect(await screen.findByText("목록 화면")).toBeTruthy();
    expect(value.refresh).toHaveBeenCalled();
  });
});
