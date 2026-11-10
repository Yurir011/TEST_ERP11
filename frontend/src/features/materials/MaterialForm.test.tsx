// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialForm } from "./MaterialForm";

const api = vi.hoisted(() => ({ apiPost: vi.fn(), apiGet: vi.fn(), apiPut: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), ...api }));

beforeEach(() => {
  api.apiGet.mockImplementation(async (path: string) => (path === "/api/materials/level-history" ? { levels: [["MCU", "저항"], ["Cortex-M3", "Cortex-M4"], ["LQFP48"]] } : {}));
});

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

const registerBtn = () => screen.getByRole("button", { name: "등록" }) as HTMLButtonElement;

describe("자재 등록 폼 (시안 A-3)", () => {
  it("품목 칩은 5개, 회로부품 칩에는 '회로부품' 글자만 보이고 눌러야 전용/범용 메뉴가 열린다", () => {
    renderForm();
    expect(screen.getAllByRole("radio").map((b) => b.textContent)).toEqual(["회로부품", "사출물", "부자재", "포장재", "소모품"]);
    expect(screen.queryByRole("menu")).toBeNull(); // 평소에는 메뉴가 없다
    fireEvent.click(screen.getByRole("radio", { name: "회로부품" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["전용EC", "범용EG"]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /전용/ }));
    expect(screen.queryByRole("menu")).toBeNull(); // 고르면 닫힌다
    expect(screen.getByRole("radio", { name: "회로부품" }).textContent).toBe("회로부품"); // 칩 글자는 그대로
    expect(screen.getByTestId("preview-path").textContent).toBe("회로부품 › 전용");
    expect(within(screen.getByLabelText("미리보기")).getByText("EC")).toBeTruthy();
  });

  it("회로부품은 전용/범용을 고르기 전에는 등록할 수 없고, 다른 품목은 종류 없이 등록된다", () => {
    renderForm();
    expect(registerBtn().disabled).toBe(true);
    expect(screen.getByText("회로부품을 눌러 전용 / 범용을 골라 주세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "포장재" }));
    expect(registerBtn().disabled).toBe(false);
    expect(within(screen.getByLabelText("미리보기")).getByText("PK")).toBeTruthy();
  });

  it("속성 칸을 누르면 그 칸 자리에 이전에 쓴 속성이 나열되고, 글자를 치면 걸러지며, 누르면 입력된다", async () => {
    renderForm();
    await act(async () => {}); // 이전 속성을 불러오기를 기다린다
    expect(screen.queryByRole("listbox")).toBeNull();
    const first = screen.getByLabelText("속성 1");
    fireEvent.focus(first);
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(["MCU", "저항"]);
    fireEvent.change(first, { target: { value: "저" } });
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(["저항"]);
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("button", { name: "저항" }));
    expect((first as HTMLInputElement).value).toBe("저항");
    fireEvent.focus(screen.getByLabelText("속성 2")); // 2번째 칸은 2번째 칸에 쓴 값들
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Cortex-M3", "Cortex-M4"]);
  });

  it("처음 입고는 평소 개 한 칸뿐이고, 릴을 고를 때만 1릴 당 개수 칸이 나온다 (곱한 총 개수 표시)", () => {
    renderForm();
    expect(screen.queryByLabelText("입고 1릴 당 개수")).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "입고 단위" })).getByRole("button", { name: "릴" }));
    fireEvent.change(screen.getByLabelText("입고 릴 수"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("입고 1릴 당 개수"), { target: { value: "2500" } });
    expect(screen.getByLabelText("입고 총 개수").textContent).toBe("3릴 (7,500개)");
    fireEvent.click(within(screen.getByRole("group", { name: "입고 단위" })).getByRole("button", { name: "개" }));
    expect(screen.queryByLabelText("입고 1릴 당 개수")).toBeNull(); // 개로 돌아가면 다시 사라진다
  });

  it("등록하면 회로부품 종류·속성·개(또는 릴)를 담아 저장하고 상세 화면으로 간다", async () => {
    api.apiPost.mockResolvedValue({ id: 9 });
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: "회로부품" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /범용/ }));
    fireEvent.change(screen.getByLabelText("속성 1"), { target: { value: "저항" } });
    fireEvent.change(screen.getByLabelText("속성 3"), { target: { value: "0603" } });
    fireEvent.change(screen.getByLabelText("품명"), { target: { value: "저항 10kΩ" } });
    fireEvent.click(within(screen.getByRole("group", { name: "입고 단위" })).getByRole("button", { name: "릴" }));
    fireEvent.change(screen.getByLabelText("입고 릴 수"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("입고 1릴 당 개수"), { target: { value: "5000" } });
    fireEvent.click(registerBtn());
    await waitFor(() => expect(screen.getByText("상세 화면")).toBeTruthy());
    expect(api.apiPost).toHaveBeenCalledWith(
      "/api/materials",
      expect.objectContaining({ category: "ic", kind: "general", name: "저항 10kΩ", sub_levels: ["저항", "0603"], initial_in: expect.objectContaining({ reels: 2, per_reel: 5000 }) }),
    );
  });

  it("개로 적고 개수를 비워 두면 입고 기록 없이 저장된다 (포장재는 종류 없음)", async () => {
    api.apiPost.mockResolvedValue({ id: 9 });
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: "포장재" }));
    fireEvent.change(screen.getByLabelText("품명"), { target: { value: "포장 박스 A형" } });
    fireEvent.click(registerBtn());
    await waitFor(() => expect(screen.getByText("상세 화면")).toBeTruthy());
    expect(api.apiPost).toHaveBeenCalledWith("/api/materials", expect.objectContaining({ category: "packaging", kind: null, name: "포장 박스 A형", memo: null }));
    expect(api.apiPost.mock.calls[0][1]).not.toHaveProperty("initial_in");
  });
});
