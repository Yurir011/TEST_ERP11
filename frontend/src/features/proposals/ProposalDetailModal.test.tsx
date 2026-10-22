// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "./types";

vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { id: 1, name: "박소장", role: "admin" } }) }));
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ confirm: vi.fn(), notify: vi.fn() }) }));
vi.mock("../../components/approval/ApprovalHistory", () => ({ ApprovalHistory: () => null }));
const { downloadFile, apiDelete } = vi.hoisted(() => ({ downloadFile: vi.fn().mockResolvedValue(undefined), apiDelete: vi.fn() }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), downloadFile, apiDelete }));
vi.mock("../../lib/openAttachment", () => ({ openAttachment: vi.fn() }));

import { ProposalDetailModal } from "./ProposalDetailModal";

afterEach(() => {
  cleanup();
  downloadFile.mockClear();
});

const proposal = {
  id: 9,
  doc_no: "P-1",
  title: "부품 구매",
  topic: "부품 구매",
  content: "",
  kind: "구매",
  status: "approved",
  created_by: 1,
  creator_name: "박소장",
  department_name: "개발",
  issue_date: "2026-10-22",
  steps: [],
  current_step: 1,
  attachments: [
    { id: 3, kind: "file", label: "견적서.xlsx", url: null, doc_kind: null },
    { id: 4, kind: "link", label: "참고 링크", url: "https://example.com", doc_kind: null },
  ],
} as unknown as Proposal;

function renderModal(p: Proposal = proposal) {
  return render(
    <MemoryRouter>
      <ProposalDetailModal proposal={p} isBusy={false} onClose={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} onDownload={vi.fn()} onPrint={vi.fn()} onAttachmentsChanged={vi.fn()} onDeleted={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("품의서 상세의 첨부파일 저장 버튼", () => {
  it("파일 첨부에만 저장 버튼이 있고(링크에는 없음), 누르면 열지 않고 내려받는다", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: "참고 링크 저장" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "견적서.xlsx 저장" }));
    expect(downloadFile).toHaveBeenCalledWith("/api/proposals/9/attachments/3/file", "견적서.xlsx");
  });

  it("작성자가 아니어도 저장할 수 있고, 삭제 버튼은 작성자에게만 보인다", () => {
    renderModal({ ...proposal, created_by: 2 } as Proposal);
    expect(screen.getByRole("button", { name: "견적서.xlsx 저장" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "견적서.xlsx 삭제" })).toBeNull();
    cleanup();
    renderModal();
    expect(screen.getByRole("button", { name: "견적서.xlsx 삭제" })).toBeTruthy();
  });
});
