// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { AuthContext, type AuthContextValue } from "../../context/useAuth";
import { MobileApprovalsPage } from "./MobileApprovalsPage";
import { invalidateMobileBadges } from "./useMobileBadges";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(), openFile: vi.fn() }));
vi.mock("../../lib/api", () => ({ ...api, ApiError: class ApiError extends Error {} }));

const ME = 1;
const pendingStep = { step_order: 1, title: "dept_head", approver_id: 7, approver_name: "김부장", status: "pending", decided_at: null };

const toApprove = {
  id: 11, user_id: 5, user_name: "박서연", start_date: "2026-12-01", end_date: "2026-12-02", days: 2, reason: "휴가", status: "pending",
  current_step: 1, steps: [{ ...pendingStep, approver_id: ME }], reject_reason: null, created_at: "2026-11-03T09:00:00Z",
};
const mine = {
  id: 7, user_id: ME, user_name: "나", start_date: "2026-12-14", end_date: "2026-12-15", days: 2, reason: "가족 행사", status: "pending",
  current_step: 1, steps: [pendingStep], reject_reason: null, created_at: "2026-11-02T09:00:00Z",
};
const history = { kind: "proposal", id: 3, kind_label: "품의서", title: "분석기 구매", subtitle: "박서연 · P-1", result: "approved", decided_at: "2026-11-02T10:30:00Z", doc_status: "approved" };

function renderPage(path = "/m/approvals") {
  const auth: AuthContextValue = { user: { id: ME, name: "나", role: "employee" } as AuthContextValue["user"], isLoading: false, login: vi.fn(), loginWithToken: vi.fn(), logout: vi.fn() };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>
        <DialogProvider>
          <Routes>
            <Route path="/m/approvals" element={<MobileApprovalsPage />} />
          </Routes>
        </DialogProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invalidateMobileBadges();
  Object.values(api).forEach((f) => f.mockReset());
  api.apiGet.mockImplementation(async (url: string) => {
    if (url === "/api/leaves?status=pending&approver_mine=true") return [toApprove];
    if (url === "/api/leaves/me") return [mine];
    if (url === "/api/approvals/history") return [history];
    if (url === "/api/notifications/unread-count") return { count: 2 };
    return []; // 그 밖의 목록은 비어 있다
  });
  api.apiPost.mockResolvedValue({});
});
afterEach(cleanup);

describe("MobileApprovalsPage", () => {
  it("처음에는 내가 결재할 문서를 보여 주고, 하단 탭에 결재 대기 개수를 표시한다", async () => {
    renderPage();
    expect(await screen.findByText("박서연 · 휴가")).toBeTruthy();
    expect(screen.getByRole("button", { name: "승인" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "하단 메뉴" });
    await waitFor(() => expect(nav.textContent).toContain("1")); // 결재 1건
    expect(nav.textContent).toContain("2"); // 안 읽은 알림 2개
  });

  it("[내가 올린 문서]에서 승인 전 문서를 회수할 수 있다", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "내가 올린 문서" }));
    expect(await screen.findByText(/김부장 결재 대기/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "회수" }));
    // 확인창이 뜨면 [회수] 버튼이 목록과 확인창에 하나씩 있다. 확인창의 것(마지막)을 누른다.
    await screen.findByText(/결재 요청을 회수할까요/);
    const buttons = screen.getAllByRole("button", { name: "회수" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/leaves/7/withdraw"));
  });

  it("[처리 내역]에서 내가 승인한 결재를 본다", async () => {
    renderPage("/m/approvals?tab=done");
    expect(await screen.findByText("분석기 구매")).toBeTruthy();
    expect(screen.getByText("내가 승인")).toBeTruthy();
    expect(screen.getByText(/지금은 최종 승인됨/)).toBeTruthy();
  });
});
