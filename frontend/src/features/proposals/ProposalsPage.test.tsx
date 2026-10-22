// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "./types";

vi.mock("../../components/layout/MainLayout", () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("./ProposalDetailModal", () => ({ ProposalDetailModal: () => null }));
vi.mock("../../lib/useApprovalActions", () => ({ useApprovalActions: () => ({ approve: vi.fn(), reject: vi.fn() }) }));
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("../../lib/api", () => ({ apiGet, downloadFile: vi.fn(), openFile: vi.fn() }));

import { ProposalsPage } from "./ProposalsPage";

const iso = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const make = (id: number, daysAgo: number, title: string, vendor: string | null, amount: number | null) =>
  ({ id, doc_no: `P-${id}`, title, kind: null, vendor_name: vendor, amount, currency: "KRW", issue_date: iso(daysAgo), creator_name: "박소장", status: "approved", steps: [], current_step: 1, attachments: [] }) as unknown as Proposal;

beforeEach(() => {
  apiGet.mockImplementation((path: string) =>
    Promise.resolve(
      path.includes("approver_mine")
        ? []
        : [make(1, 3, "케이블", "다라전자", 300000), make(2, 10, "커넥터", "가나상사", 50000), make(3, 45, "기판", "가나상사", 1200000), make(4, 200, "공구", "마바공업", 80000)],
    ),
  );
});
afterEach(cleanup);

const titles = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
const renderPage = () => render(<MemoryRouter><ProposalsPage embedded /></MemoryRouter>);

describe("품의서 목록 검색·정렬", () => {
  it("기본은 최근 1개월, 최근 날짜 먼저", async () => {
    renderPage();
    await screen.findByRole("table");
    const rows = titles();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("케이블");
    expect(rows[1]).toContain("커넥터");
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("2건");
  });

  it("조회 기간을 늘리면 오래된 품의서도 보인다 (12개월까지 고를 수 있다)", async () => {
    renderPage();
    await screen.findByRole("table");
    const period = screen.getByLabelText("조회 기간") as HTMLSelectElement;
    expect(Array.from(period.options).map((o) => o.textContent)).toEqual(["최근 1개월", "최근 2개월", "최근 3개월", "최근 6개월", "최근 12개월"]);
    fireEvent.change(period, { target: { value: "6" } });
    expect(titles()).toHaveLength(3); // 200일 전 것은 6개월(약 180일) 밖
    fireEvent.change(period, { target: { value: "12" } });
    expect(titles()).toHaveLength(4);
  });

  it("업체명 또는 품의명으로 검색하고, 맞는 게 없으면 안내한다", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("조회 기간"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("검색"), { target: { value: "가나" } });
    expect(titles().map((t) => (t.includes("커넥터") ? "커넥터" : "기판"))).toEqual(["커넥터", "기판"]);
    fireEvent.change(screen.getByLabelText("검색"), { target: { value: "케이" } });
    expect(titles()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("검색"), { target: { value: "없는말" } });
    expect(screen.getByText(/조건에 맞는 품의서가 없습니다/)).toBeTruthy();
  });

  it("상태로 거르고, 필터 초기화를 누르면 기본(1개월·최신순)으로 돌아간다", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("조회 기간"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("상태"), { target: { value: "pending" } });
    expect(screen.getByText(/조건에 맞는 품의서가 없습니다/)).toBeTruthy(); // 예시 데이터는 모두 승인 상태
    fireEvent.change(screen.getByLabelText("상태"), { target: { value: "approved" } });
    expect(titles()).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("정렬 기준"), { target: { value: "amount" } });
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect((screen.getByLabelText("조회 기간") as HTMLSelectElement).value).toBe("1");
    expect((screen.getByLabelText("상태") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("정렬 기준") as HTMLSelectElement).value).toBe("date");
    expect(titles()).toHaveLength(2);
  });

  it("정렬 순서 콤보박스 글자는 정렬 기준에 맞게 바뀐다", async () => {
    renderPage();
    await screen.findByRole("table");
    const dir = screen.getByLabelText("정렬 순서") as HTMLSelectElement;
    expect(Array.from(dir.options).map((o) => o.textContent)).toEqual(["최신순", "오래된순"]);
    fireEvent.change(screen.getByLabelText("정렬 기준"), { target: { value: "vendor" } });
    expect(Array.from(dir.options).map((o) => o.textContent)).toEqual(["가나다 역순", "가나다순"]);
    expect(dir.value).toBe("asc");
  });

  it("금액순·업체명순으로 정렬하고 방향을 뒤집을 수 있다", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("조회 기간"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("정렬 기준"), { target: { value: "amount" } });
    expect(titles()[0]).toContain("기판"); // 금액이 큰 것부터
    fireEvent.change(screen.getByLabelText("정렬 순서"), { target: { value: "asc" } });
    expect(titles()[0]).toContain("커넥터");
    fireEvent.change(screen.getByLabelText("정렬 기준"), { target: { value: "vendor" } });
    expect(titles()[0]).toContain("가나상사"); // 가나다순
  });
});
