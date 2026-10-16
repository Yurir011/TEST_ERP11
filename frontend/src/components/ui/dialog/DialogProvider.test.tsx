// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "./DialogProvider";
import { useDialog, type DialogApi } from "./useDialog";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Provider 안에서 useDialog() 를 꺼내 테스트가 직접 부를 수 있게 한다 (렌더가 끝난 뒤 효과에서 넘겨받는다). */
function Grab({ onReady }: { onReady: (api: DialogApi) => void }) {
  const api = useDialog();
  useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return null;
}

function setup() {
  let current: DialogApi | null = null;
  render(
    <DialogProvider>
      <Grab onReady={(api) => (current = api)} />
    </DialogProvider>
  );
  return () => current!;
}

describe("DialogProvider", () => {
  it("확인 창: [삭제]를 누르면 true, 문구와 버튼 이름이 보인다", async () => {
    const dialog = setup();
    let result: Promise<boolean>;
    act(() => {
      result = dialog().confirm("이 거래 내역을 삭제할까요?", { okLabel: "삭제", danger: true });
    });
    expect(screen.getByRole("alertdialog")).toHaveProperty("textContent", expect.stringContaining("이 거래 내역을 삭제할까요?"));
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await expect(result!).resolves.toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("확인 창: 되돌릴 수 없는 일은 처음 초점이 [취소], Esc 와 [취소]는 false", async () => {
    const dialog = setup();
    let result: Promise<boolean>;
    act(() => {
      result = dialog().confirm("이 일정을 삭제할까요?", { okLabel: "삭제", danger: true });
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(document, { key: "Escape" });
    await expect(result!).resolves.toBe(false);

    act(() => {
      result = dialog().confirm("승인할까요?", { okLabel: "승인" });
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "승인" })); // 위험하지 않은 일은 [확인]에 초점
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    await expect(result!).resolves.toBe(false);
  });

  it("입력 창: 빈 칸이면 안내만 하고 닫히지 않으며, 입력하면 그 글을 돌려준다", async () => {
    const dialog = setup();
    let result: Promise<string | null>;
    act(() => {
      result = dialog().prompt("반려 사유를 입력해주세요.", { okLabel: "반려", danger: true });
    });
    await userEvent.click(screen.getByRole("button", { name: "반려" }));
    expect(screen.getByText("내용을 입력해주세요.")).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    await userEvent.type(screen.getByRole("textbox"), "예산 초과");
    await userEvent.keyboard("{Enter}"); // Enter = 확인
    await expect(result!).resolves.toBe("예산 초과");
  });

  it("입력 창: 취소하면 null", async () => {
    const dialog = setup();
    let result: Promise<string | null>;
    act(() => {
      result = dialog().prompt("반려 사유를 입력해주세요.");
    });
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    await expect(result!).resolves.toBeNull();
  });

  it("완료 알림은 4초 뒤 사라지고, 오류 알림은 닫을 때까지 남는다", () => {
    vi.useFakeTimers();
    const dialog = setup();
    act(() => {
      dialog().notify("결재 요청이 완료되었습니다.");
      dialog().notifyError("팝빌 서버와 통신하지 못했습니다.");
    });
    expect(screen.getByRole("status").textContent).toContain("결재 요청이 완료되었습니다.");
    expect(screen.getByRole("alert").textContent).toContain("팝빌 서버와 통신하지 못했습니다.");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
