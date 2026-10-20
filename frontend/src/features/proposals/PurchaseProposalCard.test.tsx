// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../projectDocuments/types";
import { PurchaseProposalCard } from "./PurchaseProposalCard";
import type { Proposal } from "./types";

afterEach(cleanup);

const proposal = (over: Partial<Proposal> = {}): Proposal =>
  ({
    id: 1, kind: "구매", title: "PCB 기판 구매", doc_no: "BS-품의-RND-261018-01", issue_date: "2026-10-18", status: "approved",
    steps: [], is_final_decision: false, delete_requested: false, reject_reason: null, order_sent_at: null, received_at: null,
    attachments: [], has_pdf: true, ...over,
  }) as unknown as Proposal;

const order = (over: Partial<ProjectDocument> = {}): ProjectDocument =>
  ({ id: 10, proposal_id: 1, doc_type: "purchase_order", status: "approved", client_name: "한솔전자", currency: "KRW",
    items: [{ content: "PCB", quantity: 10, unit_price: 58438 }], ...over }) as unknown as ProjectDocument;

function renderCard(p: Proposal, orders: ProjectDocument[] = [], extra: Partial<Parameters<typeof PurchaseProposalCard>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(), onOrder: vi.fn(), onToggleSent: vi.fn(), onToggleReceived: vi.fn(),
    onAttach: vi.fn(), onDownloadProposal: vi.fn(), onDownloadProposalExcel: vi.fn(), onPrintProposal: vi.fn(), onDownloadOrder: vi.fn(), onPrintOrder: vi.fn(),
    onDownloadOrderExcel: vi.fn(), onSendOrder: vi.fn(), onDownloadAttachment: vi.fn(), onDelete: vi.fn(),
  };
  render(<PurchaseProposalCard proposal={p} orders={orders} canManage canDelete busy={false} {...handlers} {...extra} />);
  return handlers;
}

describe("구매 품의서 카드", () => {
  it("결재 대기 중에는 발주 버튼을 누를 수 없다", () => {
    renderCard(proposal({ status: "pending" }));
    expect((screen.getByRole("button", { name: "발주" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("발주 대기")).toBeTruthy();
  });

  it("승인되면 발주 버튼으로 발주서 작성을 시작하고, 미발주로 표시된다", () => {
    const h = renderCard(proposal());
    expect(screen.getByText("미발주")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "발주" }));
    expect(h.onOrder).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "입고" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("발주서가 승인되면 발주 완료와 발송 확인 버튼이 나오고, 거래처·합계가 채워진다", () => {
    const h = renderCard(proposal(), [order()]);
    expect(screen.getByText("발주 완료")).toBeTruthy();
    expect(screen.getByText("한솔전자")).toBeTruthy();
    expect(screen.getByText("₩584,380")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "발송 확인" }));
    expect(h.onToggleSent).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "발주" }));
    expect(h.onOrder).toHaveBeenCalledTimes(1); // 발주서가 있어도 발주 버튼은 선택 팝업을 연다
  });

  it("발송 확인 후에는 입고 버튼이 켜지고 누르면 입고 완료 처리를 요청한다", () => {
    const h = renderCard(proposal({ order_sent_at: "2026-10-22T01:00:00Z" }), [order()]);
    const receive = screen.getByRole("button", { name: "입고" }) as HTMLButtonElement;
    expect(receive.disabled).toBe(false);
    expect(screen.getByText("입고 대기")).toBeTruthy();
    fireEvent.click(receive);
    expect(h.onToggleReceived).toHaveBeenCalledWith(true);
  });

  it("품의 과정(구매품의서·결재 상태 배지)을 누르면 품의서를 바로 열고, 카드 전체 클릭과 겹쳐 두 번 열리지 않는다", () => {
    const h = renderCard(proposal());
    fireEvent.click(screen.getByRole("button", { name: "품의서 보기" }));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull(); // 발주서 보기는 여기에 없다 (발주 단계의 팝업에서 본다)
  });

  it("온라인 주문으로 발주 완료 처리하면 발주서 없이도 입고를 할 수 있고, 취소할 수 있다", () => {
    const h = renderCard(proposal({ order_sent_at: "2026-10-22T01:00:00Z" }), []);
    expect(screen.getByText("발주 완료")).toBeTruthy();
    expect(screen.queryByText("미발주")).toBeNull();
    expect((screen.getByRole("button", { name: "입고" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /온라인 주문/ }));
    expect(h.onToggleSent).toHaveBeenCalledWith(false);
  });

  const docFile = (id: number, doc_kind: "statement" | "tax_invoice" | null) => ({ id, kind: "file" as const, label: `서류${id}.pdf`, url: null, doc_kind, created_by: 1, created_at: "x" });

  it("입고 전에는 명세서·계산서 칩이 회색(입고 후 등록)이다", () => {
    renderCard(proposal());
    expect(screen.getByLabelText("명세서 입고 후 등록")).toBeTruthy();
    expect(screen.getByLabelText("계산서 입고 후 등록")).toBeTruthy();
  });

  it("입고 후에는 등록된 서류는 등록됨, 빠진 서류는 미등록으로 보인다", () => {
    renderCard(proposal({ order_sent_at: "2026-10-22T01:00:00Z", received_at: "2026-10-23T01:00:00Z", attachments: [docFile(1, "statement")] }));
    expect(screen.getByLabelText("명세서 등록됨")).toBeTruthy();
    expect(screen.getByLabelText("계산서 미등록")).toBeTruthy();
  });

  it("둘 다 등록되면 두 칩 모두 등록됨이다", () => {
    renderCard(proposal({ order_sent_at: "x", received_at: "y", attachments: [docFile(1, "statement"), docFile(2, "tax_invoice")] }));
    expect(screen.getByLabelText("명세서 등록됨")).toBeTruthy();
    expect(screen.getByLabelText("계산서 등록됨")).toBeTruthy();
  });

  it("종류를 정하지 않은 기타 파일은 서류로 세지 않는다 (파일 수는 첨부 아이콘 안내에 나온다)", () => {
    renderCard(proposal({ order_sent_at: "x", received_at: "y", attachments: [docFile(1, null)] }));
    expect(screen.getByLabelText("명세서 미등록")).toBeTruthy();
    expect(screen.getByLabelText("계산서 미등록")).toBeTruthy();
    expect(screen.getByRole("button", { name: "첨부" }).getAttribute("title")).toContain("파일 1/7");
  });

  it("작성자나 관리자가 아니면 발송·입고 확인을 할 수 없다", () => {
    renderCard(proposal({ order_sent_at: "2026-10-22T01:00:00Z" }), [order()], { canManage: false });
    expect((screen.getByRole("button", { name: "입고" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("첨부 버튼과 카드 본문은 각각 상세를 연다", () => {
    const h = renderCard(proposal());
    fireEvent.click(screen.getByRole("button", { name: "첨부" }));
    expect(h.onAttach).toHaveBeenCalledTimes(1);
    expect(h.onOpen).not.toHaveBeenCalled(); // 흐름 영역 클릭은 카드 전체 클릭으로 번지지 않는다
    fireEvent.click(screen.getByText("PCB 기판 구매"));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it("오른쪽에 저장·엑셀·출력·메일·삭제 5개 아이콘이 있다", () => {
    renderCard(proposal());
    for (const name of ["저장", "엑셀 저장", "출력", "메일 발송", "품의서 삭제"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("승인된 품의서만 있으면 저장·엑셀·출력은 품의서로 바로 동작하고, 메일은 발주서가 생길 때까지 꺼져 있다", () => {
    const h = renderCard(proposal());
    expect((screen.getByRole("button", { name: "메일 발송" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "엑셀 저장" }));
    expect(h.onDownloadProposalExcel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(h.onDownloadProposal).toHaveBeenCalledTimes(1); // 대상이 하나라 목록 없이 바로 저장
    fireEvent.click(screen.getByRole("button", { name: "출력" }));
    expect(h.onPrintProposal).toHaveBeenCalledTimes(1);
  });

  it("결재 대기 중인 품의서는 저장·출력할 문서가 없어 꺼져 있다", () => {
    renderCard(proposal({ status: "pending" }));
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "엑셀 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "출력" }) as HTMLButtonElement).disabled).toBe(true);
  });

  const check = (name: string | RegExp) => screen.getByRole("checkbox", { name });

  it("발주서가 생기면 저장은 체크박스 목록이 되고, 모두 선택된 채로 열려 한 번에 여러 문서를 받는다", () => {
    const o = order({ has_pdf: true, issue_date: "2026-10-20", client_name: "한솔전자" });
    const h = renderCard(proposal(), [o]);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const box = screen.getByRole("dialog", { name: "저장" });
    expect(box.textContent).toContain("품의서 (PDF)");
    expect((check("전체 선택") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "선택 저장 (2)" }));
    expect(h.onDownloadProposal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull(); // 실행하면 닫힌다
  });

  it("체크를 풀면 그 문서는 빠지고, 하나도 없으면 실행 버튼이 꺼진다", () => {
    const o = order({ has_pdf: true, issue_date: "2026-10-20", client_name: "한솔전자" });
    const h = renderCard(proposal(), [o]);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.click(check("품의서 (PDF)"));
    expect(screen.getByRole("button", { name: "선택 저장 (1)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "선택 저장 (1)" }));
    expect(h.onDownloadProposal).not.toHaveBeenCalled();
    expect(h.onDownloadOrder).toHaveBeenCalledWith(o);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.click(check("전체 선택")); // 전체 해제
    expect((screen.getByRole("button", { name: /선택 저장 \(0\)/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(check("전체 선택")); // 다시 전체 선택
    expect(screen.getByRole("button", { name: "선택 저장 (2)" })).toBeTruthy();
  });

  it("출력·엑셀·메일도 같은 체크박스 방식이다 (대상이 하나면 바로 실행)", async () => {
    const o1 = order({ id: 10, has_pdf: true, issue_date: "2026-10-20", client_name: "한솔전자" });
    const o2 = order({ id: 11, has_pdf: true, issue_date: "2026-10-22", client_name: "대성RF" });
    const h = renderCard(proposal(), [o1, o2]);

    fireEvent.click(screen.getByRole("button", { name: "엑셀 저장" }));
    expect(screen.getByRole("button", { name: "선택 엑셀 저장 (3)" })).toBeTruthy(); // 품의서 + 발주서 2장
    fireEvent.click(check("품의서 (엑셀)"));
    fireEvent.click(screen.getByRole("button", { name: "선택 엑셀 저장 (2)" }));
    expect(h.onDownloadProposalExcel).not.toHaveBeenCalled();
    expect(h.onDownloadOrderExcel).toHaveBeenCalledWith(o1);
    await waitFor(() => expect(h.onDownloadOrderExcel).toHaveBeenCalledWith(o2)); // 두 번째는 간격을 두고 이어서 실행

    fireEvent.click(screen.getByRole("button", { name: "출력" }));
    expect(screen.getByRole("button", { name: "선택 출력 (3)" })).toBeTruthy(); // 품의서 + 발주서 2장
    fireEvent.click(check(/한솔전자/));
    fireEvent.click(check("품의서"));
    fireEvent.click(screen.getByRole("button", { name: "선택 출력 (1)" }));
    expect(h.onPrintOrder).toHaveBeenCalledWith(o2);
    expect(h.onPrintProposal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "메일 발송" }));
    fireEvent.click(check(/대성RF/));
    fireEvent.click(screen.getByRole("button", { name: "선택 메일 발송 (1)" }));
    expect(h.onSendOrder).toHaveBeenCalledWith(o1);
  });

  it("올려 둔 첨부파일도 저장 목록에서 체크해 받을 수 있고, 링크는 넣지 않는다", () => {
    const file = { id: 5, kind: "file" as const, label: "거래명세서.xlsx", url: null, created_by: 1, created_at: "x" };
    const link = { id: 6, kind: "link" as const, label: "링크", url: "https://x.y", created_by: 1, created_at: "x" };
    const h = renderCard(proposal({ attachments: [file, link] }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("dialog", { name: "저장" }).textContent).not.toContain("링크");
    fireEvent.click(check("품의서 (PDF)"));
    fireEvent.click(screen.getByRole("button", { name: "선택 저장 (1)" }));
    expect(h.onDownloadAttachment).toHaveBeenCalledWith(file);
    expect(h.onDownloadProposal).not.toHaveBeenCalled();
  });

  it("목록 밖을 누르면 닫히고, 아이콘을 눌러도 카드 전체 클릭으로 번지지 않는다", () => {
    const h = renderCard(proposal(), [order({ has_pdf: true })]);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("dialog", { name: "저장" })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.onOpen).not.toHaveBeenCalled();
  });

  it("삭제 아이콘은 권한이 있을 때만 켜지고, 누르는 것이 카드 전체 클릭으로 번지지 않는다", () => {
    const h = renderCard(proposal());
    fireEvent.click(screen.getByRole("button", { name: "품의서 삭제" }));
    expect(h.onDelete).toHaveBeenCalledTimes(1);
    expect(h.onOpen).not.toHaveBeenCalled();
    cleanup();
    renderCard(proposal(), [], { canDelete: false });
    expect((screen.getByRole("button", { name: "품의서 삭제" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("결재가 2단계이면 결재대기 배지가 2개 보인다", () => {
    renderCard(
      proposal({
        status: "pending",
        steps: [
          { step_order: 1, title: "dept_head", approver_id: 1, approver_name: "부서장", status: "pending", decided_at: null },
          { step_order: 2, title: "ceo", approver_id: 2, approver_name: "대표", status: "pending", decided_at: null },
        ],
      }),
    );
    expect(screen.getAllByText("결재대기")).toHaveLength(2);
  });
});
