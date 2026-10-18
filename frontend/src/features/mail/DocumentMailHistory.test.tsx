// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ apiGet }));

import { DocumentMailHistory } from "./DocumentMailHistory";

afterEach(() => {
  cleanup();
  apiGet.mockReset();
});

describe("문서 메일 발송 이력", () => {
  it("이력을 받는 사람·제목·보낸 직원과 함께 보여 준다", async () => {
    apiGet.mockResolvedValue([
      { id: 2, created_at: "2026-10-18T09:05:00", sender_name: "김직원", to_addresses: "a@x.com, b@y.com", subject: "[견적서] 신제품" },
      { id: 1, created_at: "2026-10-17T15:30:00", sender_name: null, to_addresses: "c@z.kr", subject: "재발송" },
    ]);
    render(<DocumentMailHistory docType="project_document" docId={7} />);
    expect(await screen.findByRole("region", { name: "메일 발송 이력" })).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/api/mail/logs?doc_type=project_document&doc_id=7");
    expect(screen.getByText(/2026-10-18 09:05 · 김직원/)).toBeTruthy();
    expect(screen.getByText("받는 사람: a@x.com, b@y.com")).toBeTruthy();
    expect(screen.getByText(/2026-10-17 15:30 · \(퇴사한 직원\)/)).toBeTruthy();
  });

  it("이력이 없거나 조회에 실패하면 아무것도 보이지 않는다", async () => {
    apiGet.mockResolvedValue([]);
    const { container } = render(<DocumentMailHistory docType="project_document" docId={7} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
    cleanup();
    apiGet.mockRejectedValue(new Error("403"));
    const second = render(<DocumentMailHistory docType="project_document" docId={8} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(second.container.innerHTML).toBe("");
  });
});
