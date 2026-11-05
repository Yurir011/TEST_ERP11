// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasskeyLoginButton } from "./PasskeyLoginButton";

const pk = vi.hoisted(() => ({
  passkeySupported: vi.fn(),
  fetchPasskeyEnabled: vi.fn(),
  loginWithPasskey: vi.fn(),
  passkeyErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : "오류")),
}));
vi.mock("../../lib/passkey", () => pk);

beforeEach(() => {
  Object.values(pk).forEach((f) => f.mockClear());
  pk.passkeySupported.mockReturnValue(true);
  pk.fetchPasskeyEnabled.mockResolvedValue(true);
});
afterEach(cleanup);

describe("PasskeyLoginButton", () => {
  it("브라우저가 지원하지 않거나 서버 설정이 없으면 버튼을 보여 주지 않는다", async () => {
    pk.passkeySupported.mockReturnValue(false);
    const { container, rerender } = render(<PasskeyLoginButton onToken={vi.fn()} />);
    expect(container.textContent).toBe("");
    expect(pk.fetchPasskeyEnabled).not.toHaveBeenCalled(); // 지원하지 않으면 서버에 묻지도 않는다

    pk.passkeySupported.mockReturnValue(true);
    pk.fetchPasskeyEnabled.mockResolvedValue(false);
    rerender(<PasskeyLoginButton onToken={vi.fn()} key="again" />);
    await waitFor(() => expect(pk.fetchPasskeyEnabled).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /지문·얼굴로 로그인/ })).toBeNull();
  });

  it("누르면 패스키로 로그인해 받은 토큰을 넘긴다", async () => {
    pk.loginWithPasskey.mockResolvedValue("token-123");
    const onToken = vi.fn().mockResolvedValue(undefined);
    render(<PasskeyLoginButton onToken={onToken} />);
    fireEvent.click(await screen.findByRole("button", { name: /지문·얼굴로 로그인/ }));
    await waitFor(() => expect(onToken).toHaveBeenCalledWith("token-123"));
  });

  it("실패하면 안내 문구를 보여 주고 토큰은 넘기지 않는다", async () => {
    pk.loginWithPasskey.mockRejectedValue(new Error("취소했거나 시간이 지났습니다."));
    const onToken = vi.fn();
    render(<PasskeyLoginButton onToken={onToken} />);
    fireEvent.click(await screen.findByRole("button", { name: /지문·얼굴로 로그인/ }));
    expect(await screen.findByText("취소했거나 시간이 지났습니다.")).toBeTruthy();
    expect(onToken).not.toHaveBeenCalled();
  });
});
