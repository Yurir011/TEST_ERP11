// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "./types";

vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { id: 2, name: "결재자", role: "admin" } }) }));
vi.mock("../mail/DocumentMailHistory", () => ({ DocumentMailHistory: () => null }));

import { ProjectDocumentDetailModal } from "./ProjectDocumentDetailModal";

afterEach(cleanup);

const doc = {
  id: 5,
  project_name: "젠더3_PBA 개발 공급",
  proposal_id: null,
  doc_type: "quotation",
  issue_date: "2026-10-02",
  doc_no: "1012",
  currency: "KRW",
  purpose_type: "청구",
  client_name: "크레신",
  manager_name: "홍길동 과장",
  remark: null,
  items: [
    { id: 1, content: "모니터", quantity: 1000, unit_price: 210000, note: "LG" },
    { id: 2, content: "키보드", quantity: 1000, unit_price: 12000, note: null },
  ],
  has_pdf: true,
  has_excel: true,
  set_id: null,
  status: "pending",
  current_step: 1,
  steps: [{ step_order: 1, title: "team_lead", approver_id: 2, approver_name: "결재자", status: "pending", decided_at: null }],
  is_final_decision: false,
  reviewed_at: null,
  reject_reason: null,
  created_by: 1,
  creator_name: "직원2",
  created_at: "2026-10-02T04:45:00Z",
  delete_requested: false,
  popbill_issued: false,
  images: [],
} as unknown as ProjectDocument;

function renderModal(d: ProjectDocument = doc, handlers: Partial<{ onApprove: () => void }> = {}) {
  const noop = vi.fn();
  return render(
    <ProjectDocumentDetailModal
      doc={d}
      isBusy={false}
      onClose={noop}
      onApprove={handlers.onApprove ?? noop}
      onReject={noop}
      onDownload={noop}
      onDownloadExcel={noop}
      onPrint={noop}
      onSend={noop}
      onPopbillIssue={noop}
      onPopbillView={noop}
      onPopbillPdf={noop}
      onEdit={noop}
    />,
  );
}

describe("견적서·거래명세서 상세 창 (품의서와 같은 문서 서식)", () => {
  it("제목·수신·합계(한글 포함)·품목 번호를 보여 주고 결재칸이 있다", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "견적서" })).toBeTruthy();
    expect(screen.getByText("귀하", { exact: false })).toBeTruthy();
    expect(screen.getByText("일금 이억이천이백만 원정")).toBeTruthy();
    expect(screen.getByText("₩222,000,000")).toBeTruthy();
    expect(screen.getByRole("table", { name: "결재 현황" })).toBeTruthy();
    expect(screen.getByText("No. 1012")).toBeTruthy();
  });

  it("결재 차례인 사람에게 승인 버튼이 보이고 누르면 승인한다", () => {
    const onApprove = vi.fn();
    renderModal(doc, { onApprove });
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(onApprove).toHaveBeenCalledWith(doc);
  });

  it("외화 문서는 한글 금액을 쓰지 않는다", () => {
    renderModal({ ...doc, currency: "USD" });
    expect(screen.queryByText(/일금/)).toBeNull();
  });
});
