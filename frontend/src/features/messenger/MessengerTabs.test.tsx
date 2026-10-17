// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { AuthContext, type AuthContextValue } from "../../context/useAuth";
import { MessengerPage } from "./MessengerPage";
import type { ConversationSummary, DirectoryUser } from "./types";
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
vi.mock("../../components/layout/MainLayout", () => ({
  MainLayout: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div>
      <div data-testid="actions">{actions}</div>
      {children}
    </div>
  ),
}));

const ME = 1;
const dir = (id: number, name: string, status: string, is_favorite = false): DirectoryUser => ({ id, name, grade: "staff", title: null, status, is_favorite });
const conv = (id: number, title: string, unread = 0): ConversationSummary => ({
  id, kind: "direct", title, members: [{ id: ME, name: "나", last_read_message_id: null }, { id: 2, name: title, last_read_message_id: null }],
  last_message: null, unread_count: unread, muted: false, created_at: "2026-10-01T00:00:00Z", last_message_at: null,
});

const DIRECTORY = [dir(2, "김영희", "working", true), dir(3, "이철수", "trip"), dir(4, "박영수", "leave", true), dir(5, "최민수", "absent")];

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function setup(over: Partial<MessengerContextValue> = {}) {
  const value: MessengerContextValue = {
    conversations: [conv(10, "김영희", 2), conv(11, "이철수", 1)], unreadTotal: 3, connection: { state: "connected", epoch: 1 },
    refresh: vi.fn().mockResolvedValue(undefined), subscribe: () => () => {}, setActiveConversation: vi.fn(),
    directory: DIRECTORY, myStatus: "working", ensureDirectory: vi.fn(),
    changeMyStatus: vi.fn().mockResolvedValue(undefined), toggleFavorite: vi.fn().mockResolvedValue(undefined), ...over,
  };
  const auth: AuthContextValue = { user: { id: ME, name: "나" } as AuthContextValue["user"], isLoading: false, login: vi.fn(), loginWithToken: vi.fn(), logout: vi.fn() };
  render(
    <MemoryRouter initialEntries={["/messenger"]}>
      <AuthContext.Provider value={auth}>
        <DialogProvider>
          <MessengerContext.Provider value={value}>
            <Where />
            <Routes>
              <Route path="/messenger" element={<MessengerPage />} />
              <Route path="/messenger/:conversationId" element={<MessengerPage />} />
            </Routes>
          </MessengerContext.Provider>
        </DialogProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return value;
}

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(name) });
const path = () => screen.getByTestId("path").textContent;

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.apiGet.mockResolvedValue({ messages: [], has_more: false });
  api.apiPut.mockResolvedValue({});
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("메신저 탭", () => {
  it("대화목록·즐겨찾기·전체목록 세 탭이 이 순서로 있고 처음에는 대화목록이 선택돼 있다", () => {
    setup();
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+|99\+/g, "").trim())).toEqual(["대화목록", "즐겨찾기", "전체목록"]);
    expect(tab("대화목록").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("김영희")).toBeTruthy(); // 대화방 목록
    expect(screen.getByRole("button", { name: /새 대화/ })).toBeTruthy();
  });

  it("화면이 열리면 직원 목록·상태를 불러오도록 요청한다", () => {
    const value = setup();
    expect(value.ensureDirectory).toHaveBeenCalled();
  });

  it("대화목록 탭에는 안 읽은 수, 즐겨찾기 탭에는 즐겨찾기한 사람 수가 붙는다", () => {
    setup();
    expect(within(tab("대화목록")).getByLabelText("안 읽은 메시지 3개")).toBeTruthy();
    expect(within(tab("즐겨찾기")).getByLabelText("즐겨찾기 2명")).toBeTruthy();
    expect(within(tab("전체목록")).queryByLabelText(/명|개/)).toBeNull();
  });

  it("전체목록 탭: 모든 직원이 이름 옆 체크박스·현재 상태와 함께 나오고 즐겨찾기한 사람은 체크돼 있다", () => {
    setup();
    fireEvent.click(tab("전체목록"));
    expect(tab("전체목록").getAttribute("aria-selected")).toBe("true");
    for (const name of ["김영희", "이철수", "박영수", "최민수"]) expect(screen.getByLabelText(`${name} 즐겨찾기`)).toBeTruthy();
    expect((screen.getByLabelText("김영희 즐겨찾기") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("이철수 즐겨찾기") as HTMLInputElement).checked).toBe(false);
    const list = within(screen.getByLabelText("전체 직원 목록")); // (오른쪽 위 콤보박스의 선택지와 구분)
    for (const label of ["출근", "출장", "휴가", "미출근"]) expect(list.getByText(label)).toBeTruthy();
  });

  it("즐겨찾기 탭: 즐겨찾기한 직원만 나온다", () => {
    setup();
    fireEvent.click(tab("즐겨찾기"));
    expect(screen.getByText("김영희")).toBeTruthy();
    expect(screen.getByText("박영수")).toBeTruthy();
    expect(screen.queryByText("이철수")).toBeNull();
    expect(screen.queryByText("최민수")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("직원 목록을 아직 못 받았으면 불러오는 중이라고 보여 준다", () => {
    setup({ directory: null });
    fireEvent.click(tab("전체목록"));
    expect(screen.getByText("불러오는 중...")).toBeTruthy();
    fireEvent.click(tab("즐겨찾기"));
    expect(screen.getByText("불러오는 중...")).toBeTruthy();
  });

  it("체크박스를 누르면 즐겨찾기 변경을 요청한다", async () => {
    const value = setup();
    fireEvent.click(tab("전체목록"));
    fireEvent.click(screen.getByLabelText("이철수 즐겨찾기"));
    await waitFor(() => expect(value.toggleFavorite).toHaveBeenCalledWith(3, true));
    fireEvent.click(screen.getByLabelText("김영희 즐겨찾기"));
    await waitFor(() => expect(value.toggleFavorite).toHaveBeenCalledWith(2, false));
  });

  it("즐겨찾기 변경이 실패하면 안내한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ toggleFavorite: vi.fn().mockRejectedValue(new Error("network")) });
    fireEvent.click(tab("전체목록"));
    fireEvent.click(screen.getByLabelText("이철수 즐겨찾기"));
    expect(await screen.findByText("즐겨찾기를 바꾸지 못했습니다.")).toBeTruthy();
  });

  it("전체목록에서 이름을 누르면 1:1 대화를 열고 대화목록 탭으로 가서 그 대화를 보여 준다", async () => {
    api.apiPost.mockResolvedValue({ id: 11 });
    const value = setup();
    fireEvent.click(tab("전체목록"));
    fireEvent.click(screen.getByTitle("이철수님과 대화"));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/messenger/conversations", { kind: "direct", member_ids: [3], title: null }));
    await waitFor(() => expect(path()).toBe("/messenger/11"));
    expect(value.refresh).toHaveBeenCalled();
    expect(tab("대화목록").getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByLabelText("메시지 입력")).toBeTruthy();
  });

  it("즐겨찾기 탭에서도 이름을 누르면 대화를 연다", async () => {
    api.apiPost.mockResolvedValue({ id: 10 });
    setup();
    fireEvent.click(tab("즐겨찾기"));
    fireEvent.click(screen.getByTitle("김영희님과 대화"));
    await waitFor(() => expect(path()).toBe("/messenger/10"));
    expect(api.apiPost.mock.calls[0][1]).toEqual({ kind: "direct", member_ids: [2], title: null });
  });

  it("대화를 열지 못하면 안내하고 탭과 주소는 그대로", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.apiPost.mockRejectedValue(new Error("network"));
    setup();
    fireEvent.click(tab("전체목록"));
    fireEvent.click(screen.getByTitle("이철수님과 대화"));
    expect(await screen.findByText("대화를 열지 못했습니다.")).toBeTruthy();
    expect(path()).toBe("/messenger");
    expect(tab("전체목록").getAttribute("aria-selected")).toBe("true");
  });
});

describe("내 상태 콤보박스", () => {
  it("메신저 오른쪽 위에 현재 상태와 함께 있고, 바꾸면 요청한다", async () => {
    const value = setup({ myStatus: "meeting" });
    const select = within(screen.getByTestId("actions")).getByLabelText("내 상태") as HTMLSelectElement;
    expect(select.value).toBe("meeting");
    fireEvent.change(select, { target: { value: "outside" } });
    await waitFor(() => expect(value.changeMyStatus).toHaveBeenCalledWith("outside"));
  });
});
