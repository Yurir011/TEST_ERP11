// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { DirectoryList } from "./DirectoryList";
import { PresenceBadge } from "./PresenceBadge";
import { PresenceSelect } from "./PresenceSelect";
import type { DirectoryUser } from "./types";
import { MessengerContext, type MessengerContextValue } from "./useMessenger";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
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

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
});
afterEach(cleanup);

const user = (id: number, name: string, over: Partial<DirectoryUser> = {}): DirectoryUser => ({ id, name, grade: "manager", title: "team_lead", status: "working", is_favorite: false, ...over });

describe("PresenceBadge", () => {
  it("색 점과 상태 글자를 보여 준다", () => {
    render(<PresenceBadge status="outside" />);
    expect(screen.getByText("외근")).toBeTruthy();
    expect(screen.getByTitle("현재 상태: 외근")).toBeTruthy();
  });
});

describe("DirectoryList", () => {
  const users = [user(1, "김영희", { status: "working", is_favorite: true }), user(2, "이철수", { status: "trip" }), user(3, "박영수", { status: "leave" })];

  it("전체목록: 이름 옆 체크박스, 직급·직책, 현재 상태(출근·출장·휴가)를 보여 준다", () => {
    render(<DirectoryList users={users} mode="all" onOpen={vi.fn()} onToggleFavorite={vi.fn()} />);
    expect(screen.getByText("김영희")).toBeTruthy();
    expect(screen.getAllByText("과장 · 팀장")).toHaveLength(3);
    for (const label of ["출근", "출장", "휴가"]) expect(screen.getByText(label)).toBeTruthy();
    expect((screen.getByLabelText("김영희 즐겨찾기") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("이철수 즐겨찾기") as HTMLInputElement).checked).toBe(false);
  });

  it("체크박스를 누르면 즐겨찾기 변경을 알리고, 대화는 열지 않는다", () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    render(<DirectoryList users={users} mode="all" onOpen={onOpen} onToggleFavorite={onToggle} />);
    fireEvent.click(screen.getByLabelText("이철수 즐겨찾기"));
    expect(onToggle).toHaveBeenCalledWith(2, true);
    fireEvent.click(screen.getByLabelText("김영희 즐겨찾기"));
    expect(onToggle).toHaveBeenCalledWith(1, false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("이름을 누르면 그 직원과의 대화를 연다", () => {
    const onOpen = vi.fn();
    render(<DirectoryList users={users} mode="all" onOpen={onOpen} onToggleFavorite={vi.fn()} />);
    fireEvent.click(screen.getByText("이철수"));
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it("즐겨찾기 탭은 체크박스 없이 상태만 보여 준다", () => {
    render(<DirectoryList users={[users[0]]} mode="favorites" onOpen={vi.fn()} onToggleFavorite={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("출근")).toBeTruthy();
  });

  it("이름 검색, 검색 결과 없음, 불러오는 중, 비어 있음 안내", () => {
    const { rerender } = render(<DirectoryList users={users} mode="all" onOpen={vi.fn()} onToggleFavorite={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("직원 이름 검색"), { target: { value: "영" } });
    expect(screen.queryByText("이철수")).toBeNull();
    expect(screen.getByText("김영희")).toBeTruthy();
    expect(screen.getByText("박영수")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("직원 이름 검색"), { target: { value: "없음" } });
    expect(screen.getByText("검색 결과가 없습니다.")).toBeTruthy();

    rerender(<DirectoryList users={null} mode="all" onOpen={vi.fn()} onToggleFavorite={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("직원 이름 검색"), { target: { value: "" } });
    expect(screen.getByText("불러오는 중...")).toBeTruthy();

    rerender(<DirectoryList users={[]} mode="favorites" onOpen={vi.fn()} onToggleFavorite={vi.fn()} />);
    expect(screen.getByText(/즐겨찾기한 직원이 없습니다/)).toBeTruthy();
  });
});

describe("PresenceSelect", () => {
  function ctx(over: Partial<MessengerContextValue> = {}): MessengerContextValue {
    return {
      conversations: [], unreadTotal: 0, connection: { state: "connected", epoch: 1 }, refresh: vi.fn(), subscribe: () => () => {}, setActiveConversation: vi.fn(),
      directory: [], myStatus: "working", ensureDirectory: vi.fn(), changeMyStatus: vi.fn().mockResolvedValue(undefined), toggleFavorite: vi.fn(), ...over,
    };
  }
  const wrap = (value: MessengerContextValue, children: ReactNode = <PresenceSelect />) => (
    <DialogProvider>
      <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>
    </DialogProvider>
  );
  const select = () => screen.getByLabelText("내 상태") as HTMLSelectElement;

  it("고를 수 있는 상태는 출근·회의중·식사중·외근·출장·휴가·퇴근이고 현재 상태가 선택돼 있다", () => {
    render(wrap(ctx({ myStatus: "trip" })));
    expect([...select().options].map((o) => o.textContent)).toEqual(["출근", "회의중", "식사중", "외근", "출장", "휴가", "퇴근"]);
    expect(select().value).toBe("trip");
  });

  it("출근 전(미출근)이면 미출근을 현재 값으로만 보여 주고 고를 수는 없다", () => {
    render(wrap(ctx({ myStatus: "absent" })));
    const options = [...select().options];
    expect(options[0].textContent).toBe("미출근");
    expect(options[0].disabled).toBe(true);
    expect(select().value).toBe("absent");
  });

  it("상태를 아직 모르면 불러오는 중이고 바꿀 수 없다", () => {
    render(wrap(ctx({ myStatus: null })));
    expect(select().disabled).toBe(true);
    expect(screen.getByText("불러오는 중...")).toBeTruthy();
  });

  it("다른 상태를 고르면 바꾸라고 요청한다", async () => {
    const value = ctx();
    render(wrap(value));
    fireEvent.change(select(), { target: { value: "outside" } });
    await waitFor(() => expect(value.changeMyStatus).toHaveBeenCalledWith("outside"));
  });

  it("서버가 거절하면 그 문구를 알린다", async () => {
    const { ApiError } = await import("../../lib/api");
    const value = ctx({ changeMyStatus: vi.fn().mockRejectedValue(new ApiError(422, "허용되지 않는 상태입니다.")) });
    render(wrap(value));
    fireEvent.change(select(), { target: { value: "meal" } });
    expect(await screen.findByText("허용되지 않는 상태입니다.")).toBeTruthy();
  });

  it("연결이 끊겨 요청이 실패하면 기본 안내", async () => {
    const value = ctx({ changeMyStatus: vi.fn().mockRejectedValue(new Error("network")) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(wrap(value));
    fireEvent.change(select(), { target: { value: "meal" } });
    expect(await screen.findByText("상태를 바꾸지 못했습니다.")).toBeTruthy();
  });
});
