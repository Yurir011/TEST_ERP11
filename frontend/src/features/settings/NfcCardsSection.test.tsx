// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import type { BenchClient, NfcReaderStatus } from "../../lib/desktop";
import { NfcCardsSection } from "./NfcCardsSection";
import type { NfcCard } from "./nfcCards";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn() }));
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

const card = (over: Partial<NfcCard> = {}): NfcCard => ({
  id: 1, user_id: 7, uid_last4: "515D", label: "사원증", is_active: true,
  registered_at: "2026-10-17T01:00:00Z", last_used_at: null, deactivated_at: null, ...over,
});

function renderSection() {
  return render(
    <DialogProvider>
      <NfcCardsSection userId={7} userName="홍길동" />
    </DialogProvider>,
  );
}

/** 데스크톱 앱이 화면에 넣어 주는 benchClient 흉내 */
function installBench(status: NfcReaderStatus) {
  let onCard: ((c: { uid: string }) => void) | null = null;
  const bench = {
    nfc: {
      setMode: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue(status),
      onStatus: vi.fn(() => () => {}),
      onCard: vi.fn((cb: (c: { uid: string }) => void) => {
        onCard = cb;
        return () => { onCard = null; };
      }),
    },
  } as unknown as BenchClient;
  window.benchClient = bench;
  return { bench, tap: (uid: string) => act(() => onCard?.({ uid })), listening: () => onCard !== null };
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.apiGet.mockResolvedValue([]);
  delete window.benchClient;
});
afterEach(cleanup);

describe("NfcCardsSection — 브라우저", () => {
  it("등록된 카드는 이름과 끝 4자리만 보여 준다", async () => {
    api.apiGet.mockResolvedValue([card(), card({ id: 2, label: "교통카드", uid_last4: "625D", is_active: false })]);
    renderSection();
    expect(await screen.findByText("사원증")).toBeTruthy();
    expect(screen.getByText("…515D")).toBeTruthy();
    expect(screen.getByText("중지됨")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "사용 중지" })).toHaveLength(1); // 사용 중인 카드만
  });

  it("제목에 어느 직원의 카드인지 이름이 보인다", async () => {
    renderSection();
    expect((await screen.findAllByText(/홍길동/)).length).toBeGreaterThan(0);
    expect(api.apiGet).toHaveBeenCalledWith("/api/users/7/nfc-cards");
  });

  it("카드가 없으면 안내하고, 번호를 직접 입력한다고 알린다", async () => {
    renderSection();
    expect(await screen.findByText("등록된 카드가 없습니다.")).toBeTruthy();
    expect(screen.getByText(/직접 입력합니다/)).toBeTruthy();
  });

  it("번호가 올바를 때만 [카드 등록]이 켜지고, 정리된 번호와 이름을 서버로 보낸다", async () => {
    api.apiPost.mockResolvedValue(card());
    renderSection();
    await screen.findByText("등록된 카드가 없습니다.");
    const submit = screen.getByRole("button", { name: "카드 등록" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("카드 번호"), { target: { value: "0b:9f" } });
    expect(screen.getByText(/8, 14, 20/)).toBeTruthy();
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("카드 번호"), { target: { value: "0b:9f:51:5d" } });
    fireEvent.change(screen.getByLabelText("카드 이름"), { target: { value: " 사원증 " } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/users/7/nfc-cards", { uid: "0B9F515D", label: "사원증" }));
    await waitFor(() => expect((screen.getByLabelText("카드 번호") as HTMLInputElement).value).toBe("")); // 등록 후 입력 비움
  });

  it("서버가 거절하면(중복 등) 그 문구를 보여 주고 입력은 남겨 둔다", async () => {
    const { ApiError } = await import("../../lib/api");
    api.apiPost.mockRejectedValue(new ApiError(409, "이 카드는 이미 홍길동님에게 등록되어 있어 등록할 수 없습니다."));
    renderSection();
    await screen.findByText("등록된 카드가 없습니다.");
    fireEvent.change(screen.getByLabelText("카드 번호"), { target: { value: "0B9F515D" } });
    fireEvent.click(screen.getByRole("button", { name: "카드 등록" }));
    expect(await screen.findByText("이 카드는 이미 홍길동님에게 등록되어 있어 등록할 수 없습니다.")).toBeTruthy();
    expect((screen.getByLabelText("카드 번호") as HTMLInputElement).value).toBe("0B9F515D");
  });

  it("사용 중지는 확인 창에서 [사용 중지]를 눌러야 서버로 보낸다", async () => {
    api.apiGet.mockResolvedValue([card()]);
    api.apiPut.mockResolvedValue(card({ is_active: false }));
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "사용 중지" }));
    expect(api.apiPut).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    expect(api.apiPut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "사용 중지" }));
    const dialogButtons = await screen.findAllByRole("button", { name: "사용 중지" });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() => expect(api.apiPut).toHaveBeenCalledWith("/api/users/7/nfc-cards/1/deactivate"));
  });
});

describe("NfcCardsSection — 데스크톱 앱", () => {
  it("리더가 연결되기 전에는 [카드 읽기]가 꺼져 있다", async () => {
    installBench({ state: "searching" });
    renderSection();
    expect(await screen.findByText("리더를 찾는 중")).toBeTruthy();
    expect((screen.getByRole("button", { name: "카드 읽기" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("[카드 읽기] 후 카드를 대면 끝 4자리만 보여 주고, 그 번호로 등록한다", async () => {
    const { bench, tap, listening } = installBench({ state: "ready", port: "COM3" });
    api.apiPost.mockResolvedValue(card());
    renderSection();
    expect(await screen.findByText("리더 연결됨")).toBeTruthy();
    expect(listening()).toBe(false); // 읽기 전에는 카드 신호를 받지 않는다

    fireEvent.click(screen.getByRole("button", { name: "카드 읽기" }));
    expect(screen.getByText("카드를 리더에 대세요...")).toBeTruthy();
    expect(listening()).toBe(true);
    await waitFor(() => expect(bench.nfc.setMode).toHaveBeenLastCalledWith("capture")); // 읽는 동안 앱은 로그인하지 않고 번호만 전달

    tap("0B9F515D");
    expect(await screen.findByText(/카드를 읽었습니다/)).toBeTruthy();
    expect(screen.getByText(/끝 4자리 515D/)).toBeTruthy();
    expect(screen.queryByText(/0B9F515D/)).toBeNull(); // 전체 번호는 화면에 나오지 않는다
    expect(listening()).toBe(false); // 한 번 읽으면 더 받지 않는다
    await waitFor(() => expect(bench.nfc.setMode).toHaveBeenLastCalledWith("off")); // 읽기가 끝나면 모드 해제

    fireEvent.click(screen.getByRole("button", { name: "카드 등록" }));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/users/7/nfc-cards", { uid: "0B9F515D", label: "" }));
  });

  it("읽기를 취소하면 카드 신호를 더 받지 않는다", async () => {
    const { tap, listening } = installBench({ state: "ready" });
    renderSection();
    await screen.findByText("리더 연결됨");
    fireEvent.click(screen.getByRole("button", { name: "카드 읽기" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(listening()).toBe(false);
    tap("0B9F515D");
    expect(screen.queryByText(/카드를 읽었습니다/)).toBeNull();
  });
});
