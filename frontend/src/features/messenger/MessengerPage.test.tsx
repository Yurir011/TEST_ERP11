// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { AuthContext, type AuthContextValue } from "../../context/useAuth";
import { MessengerPage } from "./MessengerPage";
import type { ConversationSummary } from "./types";
import { MessengerContext, type MessengerContextValue } from "./useMessenger";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(), apiUploadForm: vi.fn(), downloadFile: vi.fn(), openFile: vi.fn() }));
vi.mock("../../lib/api", () => ({ ...api, ApiError: class ApiError extends Error {} }));
// 화면 틀(사이드바 등)은 이 테스트의 관심사가 아니다
vi.mock("../../components/layout/MainLayout", () => ({ MainLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const ME = 1;
const conv = (id: number, title: string): ConversationSummary => ({
  id, kind: "direct", title, members: [{ id: ME, name: "나", last_read_message_id: null }, { id: 2, name: title, last_read_message_id: null }],
  last_message: null, unread_count: 0, muted: false, created_at: "2026-10-01T00:00:00Z", last_message_at: null,
});

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

/** 대화방 목록을 가진 가짜 Provider: refresh() 를 부르면 서버가 새로 만든 대화방이 목록에 들어온다 */
function Harness({ initial, afterRefresh, path }: { initial: ConversationSummary[]; afterRefresh: ConversationSummary[]; path: string }) {
  const [list, setList] = useState<ConversationSummary[] | null>(initial);
  const value: MessengerContextValue = {
    conversations: list, unreadTotal: 0, connection: { state: "connected", epoch: 1 },
    refresh: async () => { await new Promise((r) => setTimeout(r, 20)); setList(afterRefresh); }, // 서버에 다녀오는 시간
    subscribe: () => () => {}, setActiveConversation: () => {},
    directory: null, myStatus: null, ensureDirectory: () => {}, changeMyStatus: async () => {}, toggleFavorite: async () => {},
  };
  const auth: AuthContextValue = { user: { id: ME, name: "나" } as AuthContextValue["user"], isLoading: false, login: vi.fn(), loginWithToken: vi.fn(), logout: vi.fn() };
  return (
    <MemoryRouter initialEntries={[path]}>
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
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.apiGet.mockImplementation(async (url: string) => (url === "/api/messenger/users" ? [{ id: 2, name: "새상대", grade: "staff", title: null }] : { messages: [], has_more: false }));
  api.apiPut.mockResolvedValue({});
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const path = () => screen.getByTestId("path").textContent;

describe("MessengerPage", () => {
  it("대화방을 고르면 그 대화가 열린다", async () => {
    render(<Harness initial={[conv(10, "김영희"), conv(11, "이철수")]} afterRefresh={[]} path="/messenger" />);
    expect(screen.getByText(/왼쪽에서 대화를 고르거나/)).toBeTruthy();
    fireEvent.click(screen.getByText("이철수"));
    await waitFor(() => expect(path()).toBe("/messenger/11"));
    expect(await screen.findByLabelText("메시지 입력")).toBeTruthy();
  });

  it("새 대화를 만들면 목록을 새로 받은 뒤 그 대화로 이동한다 (목록에 없다고 되돌려 보내지 않는다)", async () => {
    api.apiPost.mockResolvedValue({ id: 99 });
    render(<Harness initial={[conv(10, "김영희")]} afterRefresh={[conv(99, "새상대"), conv(10, "김영희")]} path="/messenger" />);
    fireEvent.click(screen.getByRole("button", { name: /새 대화/ }));
    fireEvent.click(await screen.findByLabelText(/새상대/));
    fireEvent.click(screen.getByRole("button", { name: "대화 시작" }));
    await waitFor(() => expect(path()).toBe("/messenger/99"));
    expect(await screen.findByLabelText("메시지 입력")).toBeTruthy();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(path()).toBe("/messenger/99"); // 잠시 뒤에도 그대로 (되돌아가지 않는다)
  });

  it("없는 대화방 주소(나간 대화방 등)는 목록으로 돌려보낸다", async () => {
    render(<Harness initial={[conv(10, "김영희")]} afterRefresh={[]} path="/messenger/777" />);
    await waitFor(() => expect(path()).toBe("/messenger"));
  });

  it("목록을 불러오는 동안에는 되돌려 보내지 않는다", async () => {
    function Loading() {
      const value: MessengerContextValue = { conversations: null, unreadTotal: 0, connection: { state: "connecting", epoch: 0 }, refresh: async () => {}, subscribe: () => () => {}, setActiveConversation: () => {}, directory: null, myStatus: null, ensureDirectory: () => {}, changeMyStatus: async () => {}, toggleFavorite: async () => {}, };
      const auth: AuthContextValue = { user: { id: ME, name: "나" } as AuthContextValue["user"], isLoading: false, login: vi.fn(), loginWithToken: vi.fn(), logout: vi.fn() };
      return (
        <MemoryRouter initialEntries={["/messenger/10"]}>
          <AuthContext.Provider value={auth}><DialogProvider><MessengerContext.Provider value={value}>
            <Where /><Routes><Route path="/messenger/:conversationId" element={<MessengerPage />} /></Routes>
          </MessengerContext.Provider></DialogProvider></AuthContext.Provider>
        </MemoryRouter>
      );
    }
    render(<Loading />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(path()).toBe("/messenger/10");
  });
});
