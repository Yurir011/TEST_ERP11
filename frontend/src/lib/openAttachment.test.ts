// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ openFile: vi.fn(), downloadFile: vi.fn(), fetchFileBytes: vi.fn() }));
const desktop = vi.hoisted(() => ({ getBenchClient: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("./desktop", () => desktop);

import { isViewableInBrowser, openAttachment } from "./openAttachment";

afterEach(() => vi.clearAllMocks());

describe("첨부파일 바로 열기", () => {
  it("사진·PDF·텍스트는 새 창으로 연다", async () => {
    for (const name of ["a.PNG", "b.jpg", "c.pdf", "d.txt", "e.webp"]) {
      expect(isViewableInBrowser(name)).toBe(true);
      await openAttachment("/f", name);
    }
    expect(api.openFile).toHaveBeenCalledTimes(5);
    expect(api.downloadFile).not.toHaveBeenCalled();
  });

  it("문서는 앱에서는 기본 프로그램으로 바로 연다", async () => {
    const bytes = new ArrayBuffer(4);
    api.fetchFileBytes.mockResolvedValue(bytes);
    const open = vi.fn().mockResolvedValue({ ok: true });
    desktop.getBenchClient.mockReturnValue({ openFile: open });
    await openAttachment("/f", "견적.xlsx");
    expect(open).toHaveBeenCalledWith("견적.xlsx", bytes);
    expect(api.downloadFile).not.toHaveBeenCalled();
  });

  it("앱이 열지 못하면 이유를 알린다", async () => {
    api.fetchFileBytes.mockResolvedValue(new ArrayBuffer(1));
    desktop.getBenchClient.mockReturnValue({ openFile: vi.fn().mockResolvedValue({ ok: false, error: "이 파일을 열 수 있는 프로그램이 없습니다." }) });
    await expect(openAttachment("/f", "a.hwp")).rejects.toThrow("열 수 있는 프로그램이 없습니다");
  });

  it("웹 브라우저(또는 예전 앱)에서는 문서를 내려받는다", async () => {
    desktop.getBenchClient.mockReturnValue(undefined);
    await openAttachment("/f", "a.docx");
    expect(api.downloadFile).toHaveBeenCalledWith("/f", "a.docx");
    desktop.getBenchClient.mockReturnValue({});
    await openAttachment("/f", "b.xlsx");
    expect(api.downloadFile).toHaveBeenCalledTimes(2);
  });
});
