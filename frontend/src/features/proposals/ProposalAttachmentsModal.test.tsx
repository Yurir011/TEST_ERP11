// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DialogProvider } from "../../components/ui/dialog/DialogProvider";
import { MAX_PROPOSAL_FILES, ProposalAttachmentsModal, pickUploadable } from "./ProposalAttachmentsModal";
import type { Proposal } from "./types";

const api = vi.hoisted(() => ({ apiUpload: vi.fn(), apiDelete: vi.fn(), downloadFile: vi.fn(), openFile: vi.fn() }));
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

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.downloadFile.mockResolvedValue(undefined);
  api.openFile.mockResolvedValue(undefined);
});
afterEach(cleanup);

const att = (id: number) => ({ id, kind: "file" as const, label: `서류${id}.pdf`, url: null, created_by: 1, created_at: "2026-10-20T00:00:00" });
const proposal = (n: number): Proposal => ({ id: 1, title: "샘플", attachments: Array.from({ length: n }, (_, i) => att(i + 1)) }) as unknown as Proposal;
const file = (name: string, size = 10) => {
  const f = new File(["x"], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

function renderModal(p: Proposal, canEdit = true) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(
    <DialogProvider>
      <ProposalAttachmentsModal proposal={p} canEdit={canEdit} onChanged={onChanged} onClose={onClose} />
    </DialogProvider>,
  );
  return { onChanged, onClose };
}

describe("pickUploadable", () => {
  it("문서·이미지 형식만 남기고 15MB 초과와 남은 칸을 넘는 파일은 이유와 함께 뺀다", () => {
    const { accepted, problems } = pickUploadable([file("a.png"), file("b.xlsx"), file("c.exe"), file("d.pdf", 16 * 1024 * 1024), file("e.pdf"), file("f.pdf")], 2);
    expect(accepted.map((f) => f.name)).toEqual(["a.png", "b.xlsx"]);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain("c.exe");
    expect(problems[1]).toContain("15MB");
    expect(problems[2]).toContain("최대 7개");
  });
});

describe("첨부 파일 팝업", () => {
  it("첨부 개수를 n/7 로 보여 주고 목록을 내려받을 수 있다", () => {
    renderModal(proposal(3));
    expect(screen.getByLabelText("첨부 개수").textContent).toBe("첨부 3/7");
    fireEvent.click(screen.getByLabelText("서류1.pdf 내려받기"));
    expect(api.downloadFile).toHaveBeenCalledWith("/api/proposals/1/attachments/1/file", "서류1.pdf");
  });

  it("파일 이름을 누르면 PDF·이미지는 새 창에서 열고, 엑셀 같은 문서는 내려받는다", () => {
    const p = { id: 1, title: "샘플", attachments: [
      { id: 1, kind: "file", label: "견적서.pdf", url: null, created_by: 1, created_at: "x" },
      { id: 2, kind: "file", label: "사진.PNG", url: null, created_by: 1, created_at: "x" },
      { id: 3, kind: "file", label: "거래명세서.xlsx", url: null, created_by: 1, created_at: "x" },
    ] } as unknown as Proposal;
    renderModal(p);
    fireEvent.click(screen.getByRole("button", { name: "견적서.pdf 열기" }));
    expect(api.openFile).toHaveBeenCalledWith("/api/proposals/1/attachments/1/file");
    fireEvent.click(screen.getByRole("button", { name: "사진.PNG 열기" }));
    expect(api.openFile).toHaveBeenCalledWith("/api/proposals/1/attachments/2/file"); // 대문자 확장자도 인식
    fireEvent.click(screen.getByRole("button", { name: "거래명세서.xlsx 열기" }));
    expect(api.downloadFile).toHaveBeenCalledWith("/api/proposals/1/attachments/3/file", "거래명세서.xlsx");
    expect(api.openFile).toHaveBeenCalledTimes(2);
  });

  it("링크는 이름을 누르면 새 창으로 열린다", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const p = { id: 1, title: "샘플", attachments: [{ id: 9, kind: "link", label: "거래처 견적 페이지", url: "https://example.com/q", created_by: 1, created_at: "x" }] } as unknown as Proposal;
    renderModal(p);
    fireEvent.click(screen.getByRole("button", { name: "거래처 견적 페이지 열기" }));
    expect(open).toHaveBeenCalledWith("https://example.com/q", "_blank");
    open.mockRestore();
  });

  it("열지 못하면 이유를 알린다", async () => {
    api.openFile.mockRejectedValue(new Error("x"));
    renderModal(proposal(1));
    fireEvent.click(screen.getByRole("button", { name: "서류1.pdf 열기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("파일을 열지 못했습니다.");
  });

  it("고른 파일을 하나씩 올리고, 형식이 맞지 않는 파일은 올리지 않고 알린다", async () => {
    const p = proposal(0);
    api.apiUpload.mockResolvedValue({ ...p, attachments: [att(1)] });
    const { onChanged } = renderModal(p);
    fireEvent.change(screen.getByLabelText("올릴 파일"), { target: { files: [file("거래명세서.xlsx"), file("악성.exe")] } });
    await waitFor(() => expect(api.apiUpload).toHaveBeenCalledTimes(1));
    expect(api.apiUpload.mock.calls[0][0]).toBe("/api/proposals/1/attachments/file");
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("alert")).textContent).toContain("악성.exe: 올릴 수 없는 형식입니다.");
  });

  it("7개가 차면 올리기 버튼이 꺼진다", () => {
    renderModal(proposal(MAX_PROPOSAL_FILES));
    expect((screen.getByRole("button", { name: /파일 올리기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("서버가 거절하면 그 문구를 보여 준다", async () => {
    const { ApiError } = await import("../../lib/api");
    api.apiUpload.mockRejectedValue(new ApiError(400, "첨부파일은 최대 7개까지 올릴 수 있습니다."));
    renderModal(proposal(0));
    fireEvent.change(screen.getByLabelText("올릴 파일"), { target: { files: [file("a.pdf")] } });
    expect((await screen.findByRole("alert")).textContent).toContain("최대 7개까지 올릴 수 있습니다.");
  });

  it("작성자가 아니면 올리기·삭제가 없다", () => {
    renderModal(proposal(1), false);
    expect(screen.queryByRole("button", { name: /파일 올리기/ })).toBeNull();
    expect(screen.queryByLabelText("서류1.pdf 삭제")).toBeNull();
    expect(screen.getByText("작성자만 파일을 올릴 수 있습니다.")).toBeTruthy();
  });

  it("삭제는 확인 후 서버에 요청한다", async () => {
    const p = proposal(1);
    api.apiDelete.mockResolvedValue({ ...p, attachments: [] });
    const { onChanged } = renderModal(p);
    fireEvent.click(screen.getByLabelText("서류1.pdf 삭제"));
    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    await waitFor(() => expect(api.apiDelete).toHaveBeenCalledWith("/api/proposals/1/attachments/1"));
    expect(onChanged).toHaveBeenCalled();
  });
});
