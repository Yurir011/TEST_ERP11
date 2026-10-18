import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MailBridge } from "../../lib/desktop";

const { apiPost, fetchFileBytes } = vi.hoisted(() => ({ apiPost: vi.fn(), fetchFileBytes: vi.fn() }));
vi.mock("../../lib/api", () => ({ apiPost, fetchFileBytes }));

import { canComposeDocumentMail, extractEmails, openDocumentMail, reportDocumentMailSent } from "./documentMail";

const doc = { type: "project_document" as const, id: 7 };

beforeEach(() => {
  apiPost.mockReset();
  fetchFileBytes.mockReset();
});

describe("앱 여부", () => {
  it("composeDocument 가 있는 메일 통로만 쓸 수 있다", () => {
    expect(canComposeDocumentMail(undefined)).toBe(false);
    expect(canComposeDocumentMail({} as MailBridge)).toBe(false);
    expect(canComposeDocumentMail({ composeDocument: vi.fn() } as unknown as MailBridge)).toBe(true);
  });
});

describe("문서 메일 쓰기 열기", () => {
  it("PDF 를 받아 앱에 넘긴다", async () => {
    const bytes = new ArrayBuffer(4);
    fetchFileBytes.mockResolvedValue(bytes);
    const composeDocument = vi.fn().mockResolvedValue({ ok: true, value: null });
    const r = await openDocumentMail({ bridge: { composeDocument } as unknown as MailBridge, doc, pdfPath: "/api/project-documents/7/pdf", filename: "견적서.pdf", to: "a@x.com", subject: "견적서", body: "본문" });
    expect(r).toEqual({ ok: true });
    expect(fetchFileBytes).toHaveBeenCalledWith("/api/project-documents/7/pdf");
    expect(composeDocument).toHaveBeenCalledWith({ to: "a@x.com", subject: "견적서", body: "본문", doc, filename: "견적서.pdf", data: bytes });
  });

  it("앱이 거절하면 이유를 그대로 알리고, PDF 를 못 받으면 앱을 부르지 않는다", async () => {
    fetchFileBytes.mockResolvedValue(new ArrayBuffer(1));
    const refuse = vi.fn().mockResolvedValue({ ok: false, error: "메일 계정이 등록되어 있지 않습니다." });
    const base = { doc, pdfPath: "/p", filename: "a.pdf", to: "", subject: "s", body: "b" };
    expect(await openDocumentMail({ ...base, bridge: { composeDocument: refuse } as unknown as MailBridge })).toEqual({ ok: false, error: "메일 계정이 등록되어 있지 않습니다." });

    fetchFileBytes.mockRejectedValue(new Error("HTTP 403"));
    const never = vi.fn();
    const r = await openDocumentMail({ ...base, bridge: { composeDocument: never } as unknown as MailBridge });
    expect(r.ok).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });
});

describe("주소 뽑기", () => {
  it("이름 붙은 주소·여러 구분자·중복을 처리한다", () => {
    expect(extractEmails("홍길동 <a@x.com>, B@Y.com; c@z.kr", "a@X.com, 잘못된주소")).toEqual(["a@x.com", "B@Y.com", "c@z.kr"]);
    expect(extractEmails("", "  ")).toEqual([]);
  });
});

describe("발송 이력 보고", () => {
  it("받는 사람·참조·숨은참조의 주소를 모아 서버에 알린다(본문은 보내지 않는다)", async () => {
    apiPost.mockResolvedValue({ id: 1 });
    const ok = await reportDocumentMailSent(doc, { to: "a@x.com", cc: "b@x.com", bcc: "c@x.com", subject: "견적서" });
    expect(ok).toBe(true);
    expect(apiPost).toHaveBeenCalledWith("/api/mail/sent", { doc_type: "project_document", doc_id: 7, to: ["a@x.com", "b@x.com", "c@x.com"], subject: "견적서" });
  });

  it("주소가 없으면 보고하지 않고, 서버 실패는 false 로만 알린다", async () => {
    expect(await reportDocumentMailSent(doc, { to: "", cc: "", bcc: "", subject: "s" })).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
    apiPost.mockRejectedValue(new Error("x"));
    expect(await reportDocumentMailSent(doc, { to: "a@x.com", cc: "", bcc: "", subject: "s" })).toBe(false);
  });
});
