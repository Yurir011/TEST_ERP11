// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogContext, type DialogApi } from "../../components/ui/dialog/useDialog";
import { MaterialDetailPage } from "./MaterialDetailPage";
import { netOutQty, purchasedQty, type MaterialDetail, type Movement } from "./types";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiDelete: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), ...api }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "staff" } }) }));
vi.mock("../../components/layout/MainLayout", () => ({ MainLayout: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => <div>{actions}{children}</div> }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mv = (o: Partial<Movement>): Movement => ({
  id: 1, kind: "in", movement_date: "2026-11-03", quantity: 0, reels: null, reel_groups: null, return_of: null, used_qty: null,
  returned_qty: null, used_total: null, loss_qty: null, reason: null, note: null, created_by: 1, created_by_name: "김대리", created_at: "", ...o,
});

const detail: MaterialDetail = {
  id: 7, code: "EC-0001", category: "ic", category_label: "회로부품", kind: "dedicated", kind_label: "전용", name: "STM32F103C8T6", sub_levels: ["MCU", "LQFP48"],
  current_qty: 3790, current_reels: null, last_in: null, last_out: null, updated_at: "", memo: "2차 구매분 로트 확인", total_in: 5000, total_add: 0, total_out: 1400, total_return: 190, total_loss: 10,
  movements: [
    mv({ id: 4, kind: "return", quantity: 120, return_of: 3, movement_date: "2026-11-09" }),
    mv({ id: 3, kind: "out", quantity: 400, reason: "생산 불출", movement_date: "2026-11-08", returned_qty: 120 }),
    mv({ id: 2, kind: "out", quantity: 1000, reason: "시제품 제작", returned_qty: 70, used_total: 920, loss_qty: 10 }),
    mv({ id: 1, kind: "in", quantity: 5000, movement_date: "2026-10-05" }),
  ],
};

const dialogApi: DialogApi = { confirm: vi.fn(async () => true), prompt: vi.fn(), notify: vi.fn(), notifyError: vi.fn() };

function renderPage() {
  api.apiGet.mockResolvedValue(detail);
  render(
    <DialogContext.Provider value={dialogApi}>
      <MemoryRouter initialEntries={["/materials/7"]}>
        <Routes>
          <Route path="/materials/:id" element={<MaterialDetailPage />} />
        </Routes>
      </MemoryRouter>
    </DialogContext.Provider>,
  );
}

describe("자재 상세 화면 (시안 1: 위 카드 + 요약 + 아래 이력)", () => {
  it("요약은 입고(구매분) − 순 출고(출고 − 재입고) = 현재 개수 로 읽힌다", () => {
    expect(purchasedQty(detail)).toBe(5000);
    expect(netOutQty(detail)).toBe(1210);
    expect(purchasedQty(detail) - netOutQty(detail)).toBe(detail.current_qty);
  });

  it("위 카드에 코드·품명·속성·메모·현재 개수·버튼이 있고, 요약 4칸에 재입고는 출고 칸의 보조 글자로만 나온다", async () => {
    renderPage();
    const info = await screen.findByLabelText("자재 정보");
    expect(within(info).getByText("STM32F103C8T6")).toBeTruthy();
    expect(within(info).getByText("회로부품 · 전용")).toBeTruthy();
    expect(within(info).getByText("MCU")).toBeTruthy();
    expect(within(info).getByText("메모: 2차 구매분 로트 확인")).toBeTruthy();
    expect(within(info).getByLabelText("현재 개수").textContent).toBe("3,790개");
    for (const name of ["+ 입고", "↩ 재입고", "− 출고"]) expect(within(info).getByRole("button", { name })).toBeTruthy();
    const summary = screen.getByLabelText("입출고 요약");
    expect(summary.textContent).toContain("입고 (구매분)5,000");
    expect(summary.textContent).toContain("출고1,400재입고 190 반납");
    expect(summary.textContent).toContain("순 출고 (실제 사용)1,210");
    expect(summary.textContent).toContain("로스 (정산된 건)10개");
    expect(within(summary).queryByText(/^재입고$/)).toBeNull(); // 재입고 전용 칸은 없다
  });

  it("이력 탭으로 입고 / 재입고 / 출고를 걸러 보고, 재입고는 걸러도 어느 출고분인지 보인다", async () => {
    renderPage();
    const history = await screen.findByLabelText("입출고 이력");
    const tabs = within(screen.getByRole("group", { name: "이력 구분" }));
    expect(tabs.getAllByRole("button").map((b) => b.textContent)).toEqual(["전체 4", "입고 1", "재입고 1", "출고 2"]);
    fireEvent.click(tabs.getByRole("button", { name: /^재입고/ }));
    await waitFor(() => expect(within(history).queryByText("출고")).toBeNull());
    expect(within(history).getByText("2026-11-08 출고분 반납")).toBeTruthy(); // 출고 줄은 안 보여도 출처는 찾는다
    fireEvent.click(tabs.getByRole("button", { name: /^출고/ }));
    expect(within(history).getAllByLabelText("출고 정산")).toHaveLength(2);
    expect(within(history).queryByText("재입고")).toBeNull();
  });
});
