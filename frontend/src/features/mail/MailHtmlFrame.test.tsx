// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MailHtmlFrame } from "./MailHtmlFrame";
import { MAIL_FRAME_SANDBOX, buildMailDocument } from "./mailFrame";

afterEach(cleanup);

describe("메일 HTML 틀의 보안 설정", () => {
  it("sandbox 에 스크립트·같은 출처 권한이 없고 팝업만 허용한다", () => {
    const tokens = MAIL_FRAME_SANDBOX.split(/\s+/);
    expect(tokens).not.toContain("allow-scripts");
    expect(tokens).not.toContain("allow-same-origin");
    expect(tokens).not.toContain("allow-top-navigation");
    expect(tokens).not.toContain("allow-forms");
    expect(tokens).toContain("allow-popups");

    const { container } = render(<MailHtmlFrame html="<p>본문</p>" allowRemoteImages={false} title="메일" />);
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe(MAIL_FRAME_SANDBOX);
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("srcdoc")).toContain("본문");
  });

  it("기본 CSP 는 모든 것을 막고 이미지는 data: 만 허용한다", () => {
    const doc = buildMailDocument("<p>x</p>", false);
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("img-src data:;");
    expect(doc).not.toMatch(/img-src[^;]*https/);
    expect(doc).toContain("form-action 'none'");
    expect(doc).toContain('<base target="_blank">');
  });

  it("이미지 보기를 허용하면 https 이미지를 허용하고 스크립트는 여전히 막는다", () => {
    const doc = buildMailDocument("<p>x</p>", true);
    expect(doc).toMatch(/img-src data: https: http:/);
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toMatch(/script-src/);
  });
});
