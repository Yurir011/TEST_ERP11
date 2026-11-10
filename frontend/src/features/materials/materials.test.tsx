// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogContext, type DialogApi } from "../../components/ui/dialog/useDialog";
import { MovementModal } from "./MovementModal";
import { SubLevelEditor, SubLevelView } from "./SubLevelTree";
import { LIST_TABS, classLabel, formatReelQty, levelPath, matchKeyword, matchTab, type Material, type Movement } from "./types";
import { MovementList } from "./MovementList";
import { CodeText, splitCode } from "./CodeText";

const api = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), ...api }));

const dialogApi: DialogApi = { confirm: vi.fn(async () => true), prompt: vi.fn(), notify: vi.fn(), notifyError: vi.fn() };
// MovementModal 은 경고 창(useDialog)을 쓰므로 Provider 로 감싸서 그린다
const renderWithDialog = (ui: ReactElement) => render(<DialogContext.Provider value={dialogApi}>{ui}</DialogContext.Provider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ initial = [] as string[] }) {
  const [levels, setLevels] = useState(initial);
  return (
    <>
      <SubLevelEditor levels={levels} onChange={setLevels} />
      <output data-testid="saved">{JSON.stringify(levels.map((v) => v.trim()).filter(Boolean))}</output>
    </>
  );
}

describe("속성 트리 입력", () => {
  it("기본으로 3단계 칸을 보여 주고, 비워 둔 칸은 저장 값에서 빠진다", () => {
    render(<Harness />);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("속성 1"), { target: { value: "MCU" } });
    fireEvent.change(screen.getByLabelText("속성 3"), { target: { value: "LQFP48" } });
    expect(screen.getByTestId("saved").textContent).toBe('["MCU","LQFP48"]'); // 2단계를 비웠으므로 건너뛴다
  });

  it("[+ 추가]로 4단계 이상을 늘리고 지울 수 있다", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "4번 지우기" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("읽기 전용 표시는 채운 단계만 보여 주고, 비어 있으면 안내한다", () => {
    const { unmount } = render(<SubLevelView levels={["MCU", "LQFP48"]} />);
    expect(screen.getByText("MCU")).toBeTruthy();
    expect(screen.queryByText("1단계")).toBeNull(); // 단계 이름은 보여 주지 않는다
    unmount();
    render(<SubLevelView levels={[]} />);
    expect(screen.getByText("적어 둔 속성이 없습니다.")).toBeTruthy();
    expect(levelPath(["MCU", "LQFP48"])).toBe("MCU › LQFP48");
  });
});

const material = { id: 7, name: "STM32F103C8T6", current_qty: 420 };

describe("입출고 기록 창", () => {
  it("출고는 사유가 없으면 저장하지 않는다", () => {
    renderWithDialog(<MovementModal material={material} kind="out" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/출고 개수/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "출고 저장" }));
    expect(screen.getByText("출고 사유를 선택하거나 입력해주세요.")).toBeTruthy();
    expect(api.apiPost).not.toHaveBeenCalled();
  });

  it("출고 후 남는 개수를 미리 보여 주고, 사유를 골라 저장한다", async () => {
    api.apiPost.mockResolvedValue({ id: 7 });
    const onSaved = vi.fn();
    renderWithDialog(<MovementModal material={material} kind="out" onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/출고 개수/), { target: { value: "100" } });
    expect(screen.getByText("320개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "시제품 제작" }));
    fireEvent.click(screen.getByRole("button", { name: "출고 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.apiPost).toHaveBeenCalledWith("/api/materials/7/movements", expect.objectContaining({ kind: "out", quantity: 100, reason: "시제품 제작" }));
  });

  it("현재 개수보다 많이 출고하려 하면 경고 팝업을 띄우고 저장하지 않는다", async () => {
    renderWithDialog(<MovementModal material={material} kind="out" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/출고 개수/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "시제품 제작" }));
    fireEvent.click(screen.getByRole("button", { name: "출고 저장" }));
    await waitFor(() => expect(dialogApi.confirm).toHaveBeenCalled());
    expect(vi.mocked(dialogApi.confirm).mock.calls[0][0]).toContain("출고 개수(500개)가 현재 개수(420개)보다 많아 출고할 수 없습니다");
    expect(api.apiPost).not.toHaveBeenCalled();
  });

  it("추가 입고는 사유 없이 날짜와 개수만으로 저장된다", async () => {
    api.apiPost.mockResolvedValue({ id: 7 });
    const onSaved = vi.fn();
    renderWithDialog(<MovementModal material={material} kind="add" onClose={() => {}} onSaved={onSaved} />);
    expect(screen.queryByLabelText("출고 사유")).toBeNull();
    fireEvent.change(screen.getByLabelText(/추가 입고 개수/), { target: { value: "200" } });
    expect(screen.getByText("620개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "추가 입고 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.apiPost).toHaveBeenCalledWith("/api/materials/7/movements", expect.objectContaining({ kind: "add", quantity: 200, reason: null }));
  });
});

describe("릴 단위 입출고", () => {
  it("릴로 출고하면 릴 수와 1릴 당 개수를 보내고, 총 개수로 남는 개수를 계산한다", async () => {
    api.apiPost.mockResolvedValue({ id: 7 });
    const onSaved = vi.fn();
    renderWithDialog(<MovementModal material={{ ...material, current_qty: 7500, current_reels: 3 }} kind="out" onClose={() => {}} onSaved={onSaved} />);
    expect(screen.getByText(/현재 3릴 \(7,500개\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "릴" }));
    fireEvent.change(screen.getByLabelText("출고 릴 수"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("출고 1릴 당 개수"), { target: { value: "2500" } });
    expect(screen.getByText("5,000개")).toBeTruthy(); // 출고 후 남는 개수
    fireEvent.click(screen.getByRole("button", { name: "생산 불출" }));
    fireEvent.click(screen.getByRole("button", { name: "출고 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const body = api.apiPost.mock.calls[0][1];
    expect(body).toMatchObject({ kind: "out", reels: 1, per_reel: 2500, reason: "생산 불출" });
    expect(body).not.toHaveProperty("quantity");
  });

  it("릴인데 1릴 당 개수를 안 적으면 저장하지 않는다", () => {
    renderWithDialog(<MovementModal material={material} kind="add" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "릴" }));
    fireEvent.change(screen.getByLabelText("추가 입고 릴 수"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "추가 입고 저장" }));
    expect(screen.getByText("릴 수와 1릴 당 개수를 입력해주세요.")).toBeTruthy();
    expect(api.apiPost).not.toHaveBeenCalled();
  });
});

type TabRow = Pick<Material, "code" | "category" | "kind" | "category_label" | "kind_label" | "name" | "sub_levels">;

describe("목록 표시 도우미", () => {
  it("릴로 기록한 개수는 '릴(개)' 로, 개로만 기록한 건 개수만 보인다", () => {
    expect(formatReelQty(7500, 3)).toBe("3릴 (7,500개)");
    expect(formatReelQty(500, null)).toBe("500개");
    expect(formatReelQty(500)).toBe("500개");
  });

  it("탭은 회로부품 전용·범용을 나누고, 검색은 코드·품명·속성·분류에서 찾는다", () => {
    const ec: TabRow = { code: "EC-0001", category: "ic", kind: "dedicated", category_label: "회로부품", kind_label: "전용", name: "STM32", sub_levels: ["MCU", "LQFP48"] };
    const pk: TabRow = { code: "PK-0001", category: "packaging", kind: null, category_label: "포장재", kind_label: null, name: "박스 A", sub_levels: [] as string[] };
    expect(LIST_TABS.map((t) => t.label)).toEqual(["전체", "회로부품 전용", "회로부품 범용", "사출물", "부자재", "포장재", "소모품"]);
    expect(matchTab(ec, "ic:dedicated")).toBe(true);
    expect(matchTab(ec, "ic:general")).toBe(false);
    expect(matchTab(pk, "packaging")).toBe(true);
    expect(matchTab(pk, "all")).toBe(true);
    expect(matchKeyword(ec, "ec-0001")).toBe(true);
    expect(matchKeyword(ec, "lqfp")).toBe(true);
    expect(matchKeyword(pk, "포장")).toBe(true);
    expect(matchKeyword(pk, "stm")).toBe(false);
    expect(classLabel(ec)).toBe("회로부품 · 전용 · MCU › LQFP48");
    expect(classLabel(pk)).toBe("포장재");
  });

  it("코드는 대분류(앞 두 글자)만 색 블록으로, 나머지는 그대로 보인다 (긴 코드도 한 줄)", () => {
    expect(splitCode("EC-0001-A12-0603-LQFP48")).toEqual(["EC", "0001-A12-0603-LQFP48"]);
    expect(splitCode("EG0001")).toEqual(["EG", "0001"]);
    render(<CodeText code="ME-0001-CASE-UP-ABS" />);
    expect(screen.getByTestId("code-prefix").textContent).toBe("ME");
    expect(screen.getByTitle("ME-0001-CASE-UP-ABS").textContent).toContain("0001-CASE-UP-ABS");
  });
});

const mv = (o: Partial<Movement>): Movement => ({
  id: 1, kind: "in", movement_date: "2026-11-03", quantity: 0, reels: null, per_reel: null, return_of: null, used_qty: null,
  returned_qty: null, used_total: null, loss_qty: null, reason: null, note: null, created_by: 1, created_by_name: "김대리", created_at: "", ...o,
});

describe("재입고와 로스", () => {
  const outs = [mv({ id: 11, kind: "out", quantity: 1000, reason: "시제품 제작" }), mv({ id: 12, kind: "out", movement_date: "2026-11-08", quantity: 400, reason: "생산 불출" })];
  const mat = { id: 7, name: "STM32F103C8T6", current_qty: 3790, current_reels: null, movements: outs };

  it("재입고는 출고 건을 고르고 반납·사용 개수를 넣으면 로스가 자동 계산되어 저장된다", async () => {
    api.apiPost.mockResolvedValue({ id: 7 });
    const onSaved = vi.fn();
    renderWithDialog(<MovementModal material={mat} kind="return" onClose={() => {}} onSaved={onSaved} />);
    const select = screen.getByLabelText(/어느 출고 건의 반납/) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["2026-11-03 출고 1,000개 (시제품 제작)", "2026-11-08 출고 400개 (생산 불출)"]);
    fireEvent.change(screen.getByLabelText(/재입고 개수/), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText(/실제 사용한 개수/), { target: { value: "920" } });
    const calc = screen.getByLabelText("로스 계산");
    expect(calc.textContent).toContain("1,000개");
    expect(calc.textContent).toContain("10개 (1.0%)"); // 1,000 − 70 − 920
    fireEvent.click(screen.getByRole("button", { name: "재입고 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.apiPost).toHaveBeenCalledWith("/api/materials/7/movements", expect.objectContaining({ kind: "return", return_of: 11, quantity: 70, used_qty: 920, reason: null }));
  });

  it("사용 개수를 비우면 사용·로스는 0 으로 보이고, 사용 개수는 보내지 않는다 (null)", async () => {
    api.apiPost.mockResolvedValue({ id: 7 });
    renderWithDialog(<MovementModal material={mat} kind="return" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/재입고 개수/), { target: { value: "120" } });
    const calc = screen.getByLabelText("로스 계산");
    expect(calc.textContent).toContain("− 사용0개");
    expect(calc.textContent).toMatch(/로스0개$/);
    fireEvent.click(screen.getByRole("button", { name: "재입고 저장" }));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalled());
    expect(api.apiPost.mock.calls[0][1]).toMatchObject({ kind: "return", return_of: 11, quantity: 120, used_qty: null });
  });

  it("반납과 사용의 합이 출고보다 많으면 경고 팝업을 띄우고 저장하지 않는다", async () => {
    renderWithDialog(<MovementModal material={mat} kind="return" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/재입고 개수/), { target: { value: "600" } });
    fireEvent.change(screen.getByLabelText(/실제 사용한 개수/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "재입고 저장" }));
    await waitFor(() => expect(dialogApi.confirm).toHaveBeenCalled());
    expect(vi.mocked(dialogApi.confirm).mock.calls[0][0]).toContain("합이 출고한 개수(1,000개)보다 많습니다");
    expect(api.apiPost).not.toHaveBeenCalled();
  });

  it("이미 다 정산된 출고 건은 고를 수 없다, 출고가 없으면 안내한다", () => {
    const settled = [mv({ id: 11, kind: "out", quantity: 1000, returned_qty: 70, used_total: 930, loss_qty: 0 })];
    renderWithDialog(<MovementModal material={{ ...mat, movements: settled }} kind="return" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText(/재입고할 출고 기록이 없습니다/)).toBeTruthy();
  });

  it("이력의 출고 건 아래에 사용·반납·로스 타일이 붙고, 사용을 안 적었으면 사용과 로스는 0", () => {
    const list = [
      mv({ id: 11, kind: "out", quantity: 1000, reason: "시제품 제작", returned_qty: 70, used_total: 920, loss_qty: 10 }),
      mv({ id: 12, kind: "out", quantity: 400, reason: "생산 불출", returned_qty: 120, used_total: null, loss_qty: null }),
      mv({ id: 13, kind: "out", quantity: 50, reason: "샘플 제공" }), // 재입고 없음: 타일 없음
      mv({ id: 14, kind: "return", quantity: 70, return_of: 11, used_qty: 920, movement_date: "2026-11-06" }),
    ];
    render(<MovementList movements={list} isAdmin={false} onRemove={() => {}} />);
    const tiles = screen.getAllByLabelText("출고 정산");
    expect(tiles).toHaveLength(2);
    expect(tiles[0].textContent).toBe("사용920반납70로스 1.0%10");
    expect(tiles[1].textContent).toBe("사용0반납120로스0");
    expect(screen.getByText("2026-11-03 출고분 반납 · 사용 920개")).toBeTruthy();
    expect(screen.getAllByText("재입고").length).toBe(1);
  });
});
