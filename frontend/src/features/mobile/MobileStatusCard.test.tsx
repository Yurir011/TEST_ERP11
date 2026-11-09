// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessengerContext, type MessengerContextValue } from "../messenger/useMessenger";
import { MobileStatusCard } from "./MobileStatusCard";

afterEach(cleanup);

function renderCard(props: { isWorking: boolean; isDone: boolean }, myStatus: string | null = "working", changeMyStatus = vi.fn().mockResolvedValue(undefined)) {
  const ensureDirectory = vi.fn();
  const value = { myStatus, ensureDirectory, changeMyStatus } as unknown as MessengerContextValue;
  render(
    <MessengerContext.Provider value={value}>
      <MobileStatusCard {...props} />
    </MessengerContext.Provider>,
  );
  return { ensureDirectory, changeMyStatus };
}

describe("MobileStatusCard", () => {
  it("열리면 내 상태를 불러오고 현재 상태를 보여 준다", () => {
    const { ensureDirectory } = renderCard({ isWorking: true, isDone: false }, "meeting");
    expect(ensureDirectory).toHaveBeenCalled();
    expect(screen.getAllByText("회의중").length).toBeGreaterThan(0);
  });

  it("출근·퇴근은 고르는 칸에 없고 회의중·식사중·외근·출장·휴가만 있다", () => {
    renderCard({ isWorking: true, isDone: false });
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["회의중", "식사중", "외근", "출장", "휴가"]);
  });

  it("칩을 누르면 그 상태로 바꾼다", async () => {
    const { changeMyStatus } = renderCard({ isWorking: true, isDone: false });
    fireEvent.click(screen.getByRole("button", { name: "외근" }));
    await waitFor(() => expect(changeMyStatus).toHaveBeenCalledWith("outside"));
  });

  it("출근 중에 다른 상태이면 '출근 중으로 돌아가기'로 되돌린다", async () => {
    const { changeMyStatus } = renderCard({ isWorking: true, isDone: false }, "meal");
    fireEvent.click(screen.getByRole("button", { name: "출근 중으로 돌아가기" }));
    await waitFor(() => expect(changeMyStatus).toHaveBeenCalledWith("working"));
  });

  it("출근 전에는 '출근 중으로 돌아가기'가 없다", () => {
    renderCard({ isWorking: false, isDone: false }, "absent");
    expect(screen.queryByRole("button", { name: "출근 중으로 돌아가기" })).toBeNull();
  });

  it("퇴근한 뒤에는 바꿀 수 없다", () => {
    renderCard({ isWorking: false, isDone: true }, "off");
    expect((screen.getByRole("button", { name: "외근" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("퇴근한 뒤에는 상태를 바꿀 수 없어요.")).toBeTruthy();
  });

  it("서버가 거절하면 오류 문구를 보여 준다", async () => {
    renderCard({ isWorking: true, isDone: false }, "working", vi.fn().mockRejectedValue(new Error("x")));
    fireEvent.click(screen.getByRole("button", { name: "휴가" }));
    expect(await screen.findByText("상태를 바꾸지 못했습니다.")).toBeTruthy();
  });
});
