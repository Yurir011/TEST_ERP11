// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchClient } from "../../lib/desktop";

// 서버 응답을 흉내 내는 단순 함수 (vi.fn 은 거절되는 약속을 따로 추적해 시험을 실패로 만들 수 있어 쓰지 않는다)
const calls: string[] = [];
let respond: (path: string) => Promise<unknown> = () => Promise.resolve(null);
vi.mock("../../lib/api", () => ({
  apiGet: (path: string) => {
    calls.push(path);
    return respond(path);
  },
}));

import { DesktopDownloadLink } from "./DesktopDownloadLink";

const release = { version: "0.70.171", display: "V.0.70.171", filename: "BENCH-ERP_Setup_0.70.171.exe", size: 111_149_056 };

beforeEach(() => {
  calls.length = 0;
  respond = () => Promise.resolve(null);
});
afterEach(() => {
  cleanup();
  delete window.benchClient;
});

describe("설치 파일 받기 링크", () => {
  it("설치 파일이 있으면 로그인 없이 쓰는 공개 주소로 가는 링크를 보여 준다 (버전·크기 포함)", async () => {
    respond = () => Promise.resolve(release);
    render(<DesktopDownloadLink />);
    const link = await screen.findByRole("link", { name: /데스크톱 앱 설치 파일 받기/ });
    expect(link.getAttribute("href")).toBe("/api/client/public/download");
    expect(link.getAttribute("download")).toBe("BENCH-ERP_Setup_0.70.171.exe");
    expect(link.textContent).toContain("V.0.70.171");
    expect(link.textContent).toContain("106MB");
    expect(calls).toEqual(["/api/client/public/latest"]);
  });

  it("서버에 설치 파일이 없으면 링크를 보이지 않는다", async () => {
    render(<DesktopDownloadLink />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("조회에 실패해도 오류 없이 링크만 숨긴다", async () => {
    respond = () => Promise.reject(new Error("서버 오류"));
    render(<DesktopDownloadLink />);
    await waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30)); // 실패 응답이 처리될 시간
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("이미 데스크톱 앱 안에서 보고 있으면 보이지 않고 서버에 묻지도 않는다", async () => {
    window.benchClient = {} as unknown as BenchClient;
    respond = () => Promise.resolve(release);
    render(<DesktopDownloadLink />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("link")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
