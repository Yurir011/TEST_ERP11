// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { MessengerContext, type MessengerContextValue } from "../messenger/useMessenger";
import { MobileStatusCard } from "./MobileStatusCard";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), ...api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCard(myStatus: string | null = "working", changeMyStatus = vi.fn().mockResolvedValue(undefined)) {
  const ensureDirectory = vi.fn();
  const value = { myStatus, ensureDirectory, changeMyStatus } as unknown as MessengerContextValue;
  render(
    <DialogProvider>
      <MessengerContext.Provider value={value}>
        <MobileStatusCard />
      </MessengerContext.Provider>
    </DialogProvider>,
  );
  return { ensureDirectory, changeMyStatus };
}

function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: /출근|회의중|식사중|외근|출장|휴가|퇴근|불러오는 중/ }));
}

describe("MobileStatusCard", () => {
  it("열리면 내 상태를 불러오고 현재 상태를 보여 준다", () => {
    const { ensureDirectory } = renderCard("meeting");
    expect(ensureDirectory).toHaveBeenCalled();
    expect(screen.getByText("회의중")).toBeTruthy();
  });

  it("누르면 PC와 같은 7가지가 나오고 현재 상태가 표시된다", () => {
    renderCard("meeting");
    openSheet();
    const names = screen.getAllByRole("button", { name: /^(출근|회의중|식사중|외근|출장|휴가|퇴근)/ }).map((b) => b.textContent?.replace("근태 기록", "").replace("✓", ""));
    expect(names).toEqual(expect.arrayContaining(["출근", "회의중", "식사중", "외근", "출장", "휴가", "퇴근"]));
    expect(screen.getAllByRole("button", { current: true }).length).toBe(1);
  });

  it("외근을 고르면 상태만 바꾼다", async () => {
    const { changeMyStatus } = renderCard("working");
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "외근" }));
    await waitFor(() => expect(changeMyStatus).toHaveBeenCalledWith("outside"));
    expect(api.apiPost).not.toHaveBeenCalled();
  });

  it("출근을 고르면 근태 출근을 기록하고 상태를 바꾼다", async () => {
    api.apiGet.mockResolvedValue(null);
    api.apiPost.mockResolvedValue({});
    const { changeMyStatus } = renderCard("absent");
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: /^출근/ }));
    await waitFor(() => expect(changeMyStatus).toHaveBeenCalledWith("working"));
    expect(api.apiPost).toHaveBeenCalledWith("/api/attendance/clock-in");
  });

  it("지금 상태를 다시 고르면 아무것도 하지 않는다", () => {
    const { changeMyStatus } = renderCard("meal");
    openSheet();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^식사중/ }));
    expect(changeMyStatus).not.toHaveBeenCalled();
  });

  it("서버가 거절하면 오류 안내를 보여 준다", async () => {
    renderCard("working", vi.fn().mockRejectedValue(new Error("x")));
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "휴가" }));
    expect(await screen.findByText("상태를 바꾸지 못했습니다.")).toBeTruthy();
  });
});
