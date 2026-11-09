// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MovementModal } from "./MovementModal";
import { SubLevelEditor, SubLevelView } from "./SubLevelTree";
import { levelPath } from "./types";

const api = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), ...api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ initial = [] as string[] }) {
  const [levels, setLevels] = useState(initial);
  return (
    <>
      <SubLevelEditor levels={levels} onChange={setLevels} rootLabel="IC · STM32" />
      <output data-testid="saved">{JSON.stringify(levels.map((v) => v.trim()).filter(Boolean))}</output>
    </>
  );
}

describe("하위 속성 트리 입력", () => {
  it("기본으로 3단계 칸을 보여 주고, 비워 둔 칸은 저장 값에서 빠진다", () => {
    render(<Harness />);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("하위 속성 1단계"), { target: { value: "MCU" } });
    fireEvent.change(screen.getByLabelText("하위 속성 3단계"), { target: { value: "LQFP48" } });
    expect(screen.getByTestId("saved").textContent).toBe('["MCU","LQFP48"]'); // 2단계를 비웠으므로 건너뛴다
  });

  it("[+ 하위 단계 더 추가]로 4단계 이상을 늘리고 지울 수 있다", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.click(screen.getByRole("button", { name: /하위 단계 더 추가/ }));
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "4단계 지우기" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("읽기 전용 표시는 채운 단계만 보여 주고, 비어 있으면 안내한다", () => {
    const { unmount } = render(<SubLevelView levels={["MCU", "LQFP48"]} rootLabel="IC · STM32" />);
    expect(screen.getByText("MCU")).toBeTruthy();
    expect(screen.queryByText("1단계")).toBeNull(); // 단계 이름은 보여 주지 않는다
    unmount();
    render(<SubLevelView levels={[]} rootLabel="IC · STM32" />);
    expect(screen.getByText("적어 둔 하위 속성이 없습니다.")).toBeTruthy();
    expect(levelPath(["MCU", "LQFP48"])).toBe("MCU › LQFP48");
  });
});

const material = { id: 7, name: "STM32F103C8T6", current_qty: 420 };

describe("입출고 기록 창", () => {
  it("출고는 사유가 없으면 저장하지 않는다", () => {
    render(<MovementModal material={material} kind="out" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/출고 개수/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "출고 저장" }));
    expect(screen.getByText("출고 사유를 선택하거나 입력해주세요.")).toBeTruthy();
    expect(api.apiPost).not.toHaveBeenCalled();
  });

  it("출고 후 남는 개수를 미리 보여 주고, 사유를 골라 저장한다", async () => {
    api.apiPost.mockResolvedValue({ id: 7 });
    const onSaved = vi.fn();
    render(<MovementModal material={material} kind="out" onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/출고 개수/), { target: { value: "100" } });
    expect(screen.getByText("320개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "시제품 제작" }));
    fireEvent.click(screen.getByRole("button", { name: "출고 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.apiPost).toHaveBeenCalledWith("/api/materials/7/movements", expect.objectContaining({ kind: "out", quantity: 100, reason: "시제품 제작" }));
  });

  it("현재 개수보다 많이 출고할 수 없다", () => {
    render(<MovementModal material={material} kind="out" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/출고 개수/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "시제품 제작" }));
    fireEvent.click(screen.getByRole("button", { name: "출고 저장" }));
    expect(screen.getByText(/보다 많이 출고할 수 없습니다/)).toBeTruthy();
    expect(api.apiPost).not.toHaveBeenCalled();
  });

  it("추가 입고는 사유 없이 날짜와 개수만으로 저장된다", async () => {
    api.apiPost.mockResolvedValue({ id: 7 });
    const onSaved = vi.fn();
    render(<MovementModal material={material} kind="add" onClose={() => {}} onSaved={onSaved} />);
    expect(screen.queryByLabelText("출고 사유")).toBeNull();
    fireEvent.change(screen.getByLabelText(/추가 입고 개수/), { target: { value: "200" } });
    expect(screen.getByText("620개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "추가 입고 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.apiPost).toHaveBeenCalledWith("/api/materials/7/movements", expect.objectContaining({ kind: "add", quantity: 200, reason: null }));
  });
});
