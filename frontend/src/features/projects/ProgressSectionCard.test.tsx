// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProgressStage } from "./types";

vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ confirm: vi.fn(), notify: vi.fn() }) }));
const { apiGet, apiPut, apiPost, apiDelete } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock("../../lib/api", () => ({ apiGet, apiPut, apiPost, apiDelete }));

import { ProgressSectionCard } from "./ProgressSectionCard";

const stage = (id: number, name: string, order: number): ProgressStage =>
  ({ id, name, order_index: order, progress_percent: 0, completed_on: null, start_date: null, end_date: null }) as ProgressStage;
const project = { id: 5, start_date: "2026-10-01", end_date: "2026-12-31" } as Project;

beforeEach(() => {
  apiGet.mockResolvedValue([stage(1, "설계", 1), stage(2, "제작", 2), stage(3, "검수", 3)]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("진행상황 항목 순서 바꾸기", () => {
  it("아래로 누르면 순서를 서버에 저장하고 화면 순서가 바뀐다 (맨 위는 위로, 맨 아래는 아래로 못 누른다)", async () => {
    apiPut.mockResolvedValue([stage(2, "제작", 1), stage(1, "설계", 2), stage(3, "검수", 3)]);
    render(<ProgressSectionCard project={project} onStagesChange={vi.fn()} />);
    await screen.findByText("설계");
    expect((screen.getByRole("button", { name: "설계 위로 이동" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "검수 아래로 이동" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "설계 아래로 이동" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith("/api/projects/5/progress-stages/reorder", { ids: [2, 1, 3] }));
    await waitFor(() => expect(screen.getAllByText(/^(설계|제작|검수)$/).map((e) => e.textContent)).toEqual(["제작", "설계", "검수"]));
  });

  it("저장에 실패하면 서버 순서로 되돌리고 오류를 보여 준다", async () => {
    apiPut.mockRejectedValue(new Error("순서를 저장하지 못했습니다."));
    render(<ProgressSectionCard project={project} onStagesChange={vi.fn()} />);
    await screen.findByText("설계");
    fireEvent.click(screen.getByRole("button", { name: "검수 위로 이동" }));
    expect(await screen.findByText("순서를 저장하지 못했습니다.")).toBeTruthy();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2)); // 서버 값을 다시 불러온다
  });
});

describe("항목 기간을 키보드로 입력", () => {
  it("연필을 눌러 숫자 8자리를 치고 Enter 하면 그 날짜로 저장한다", async () => {
    apiPut.mockResolvedValue(stage(1, "설계", 1));
    render(<ProgressSectionCard project={project} onStagesChange={vi.fn()} />);
    await screen.findByText("설계");
    fireEvent.click(screen.getAllByTitle("기간 수정")[0]);
    const start = screen.getByLabelText("설계 시작일");
    fireEvent.change(start, { target: { value: "20261005" } });
    fireEvent.keyDown(start, { key: "Enter" });
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith("/api/projects/5/progress-stages/1/schedule", { start_date: "2026-10-05", end_date: null }),
    );
  });
});
