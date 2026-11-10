// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialForm } from "./MaterialForm";

const api = vi.hoisted(() => ({ apiPost: vi.fn(), apiGet: vi.fn(), apiPut: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), ...api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderForm() {
  render(
    <MemoryRouter initialEntries={["/materials/new"]}>
      <Routes>
        <Route path="/materials/new" element={<MaterialForm basePath="/materials" />} />
        <Route path="/materials/:id" element={<p>상세 화면</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("자재 등록 폼 (시안 A+B)", () => {
  it("항목은 탭으로 4개, 기본은 회로부품이고 미리보기에 바로 반영된다", () => {
    renderForm();
    const tabs = screen.getAllByRole("radio").map((b) => b.textContent);
    expect(tabs).toEqual(["회로부품", "사출물", "부자재", "소모품"]);
    expect(screen.getByRole("radio", { name: "회로부품" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "소모품" }));
    const preview = screen.getByLabelText("미리보기");
    expect(within(preview).getByText("소모품")).toBeTruthy();
    expect(within(preview).getByText("이름")).toBeTruthy(); // 이름을 쓰기 전
  });

  it("이름·속성·입고 개수를 쓰면 한 줄 미리보기가 목록 모양으로 바뀐다 (빈 칸은 건너뜀)", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "STM32F103C8T6" } });
    fireEvent.change(screen.getByLabelText("속성 1단계"), { target: { value: "MCU" } });
    fireEvent.change(screen.getByLabelText("속성 3단계"), { target: { value: "LQFP48" } });
    fireEvent.change(screen.getByLabelText("입고 개수"), { target: { value: "500" } });
    const preview = screen.getByLabelText("미리보기");
    expect(within(preview).getByText("STM32F103C8T6")).toBeTruthy();
    expect(within(preview).getByText("— MCU › LQFP48")).toBeTruthy();
    expect(within(preview).getByText("· 500개")).toBeTruthy();
  });

  it("등록하면 비워 둔 칸을 뺀 값으로 저장하고 상세 화면으로 간다", async () => {
    api.apiPost.mockResolvedValue({ id: 9 });
    renderForm();
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "상부 케이스" } });
    fireEvent.click(screen.getByRole("radio", { name: "사출물" }));
    fireEvent.change(screen.getByLabelText("속성 2단계"), { target: { value: "ABS 검정" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(screen.getByText("상세 화면")).toBeTruthy());
    expect(api.apiPost).toHaveBeenCalledWith("/api/materials", expect.objectContaining({ category: "injection", name: "상부 케이스", sub_levels: ["ABS 검정"], memo: null }));
    expect(api.apiPost.mock.calls[0][1]).not.toHaveProperty("initial_in"); // 개수를 비워 두면 입고를 기록하지 않는다
  });
});
