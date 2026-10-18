import { describe, expect, it } from "vitest";

import { sanitizeEmailHtml } from "./html";

const clean = (html: string, allowRemoteImages = false) => sanitizeEmailHtml(html, { allowRemoteImages });

describe("실행 가능한 내용 제거", () => {
  it("script 태그는 안쪽 글자까지 통째로 없앤다", () => {
    const { html } = clean("<p>안녕</p><script>alert('x')</script>");
    expect(html).toContain("안녕");
    expect(html).not.toMatch(/script|alert/i);
  });

  it("이벤트 속성(onerror, onclick 등)을 없앤다", () => {
    const { html } = clean('<img src="data:image/png;base64,AAAA" onerror="alert(1)"><div onclick="x()">글</div>');
    expect(html).not.toMatch(/onerror|onclick|alert/i);
    expect(html).toContain("글");
  });

  it("javascript: 링크와 data: 링크를 없앤다", () => {
    const { html } = clean('<a href="javascript:alert(1)">나쁜</a><a href="data:text/html,<script>1</script>">데이터</a><a href="https://example.com">좋은</a>');
    expect(html).not.toMatch(/javascript:|data:text/i);
    expect(html).toContain("https://example.com");
  });

  it("iframe, object, embed, form, input, style, svg 를 없앤다", () => {
    const { html } = clean(
      '<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><form action="https://evil.test"><input name="pw"></form><style>body{display:none}</style><svg onload="x()"><circle/></svg><p>본문</p>',
    );
    expect(html).not.toMatch(/iframe|object|embed|<form|<input|<style|display:none|<svg|onload/i);
    expect(html).toContain("본문");
  });

  it("스타일 속성의 url()·expression() 은 버리고 안전한 값은 남긴다", () => {
    const { html } = clean('<div style="background:url(https://evil.test/x.png);color:red;width:expression(alert(1))">글</div>');
    expect(html).not.toMatch(/url\(|expression|evil\.test/i);
    expect(html).toContain("color:red");
  });

  it("CSS background-image 도 막는다", () => {
    const { html } = clean('<td style="background-image:url(https://track.test/p.gif)">x</td>');
    expect(html).not.toMatch(/track\.test|background-image/i);
  });
});

describe("링크", () => {
  it("모든 링크는 새 창으로 열고 opener 를 끊으며, 실제 주소를 title 로 보여 준다", () => {
    const { html } = clean('<a href="https://example.com/a?b=1">여기를 누르세요</a>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('title="https://example.com/a?b=1"');
  });

  it("mailto 링크는 허용한다", () => {
    expect(clean('<a href="mailto:a@b.co">메일</a>').html).toContain("mailto:a@b.co");
  });
});

describe("원격 이미지", () => {
  const remote = '<p>안녕</p><img src="https://track.test/pixel.gif" width="1" height="1">';

  it("기본은 차단하고 차단했다는 표시를 돌려준다", () => {
    const r = clean(remote);
    expect(r.html).not.toContain("track.test");
    expect(r.html).not.toContain("<img");
    expect(r.remoteImagesBlocked).toBe(true);
    expect(r.html).toContain("안녕");
  });

  it("사용자가 허용하면 보여 준다", () => {
    const r = clean(remote, true);
    expect(r.html).toContain("https://track.test/pixel.gif");
    expect(r.remoteImagesBlocked).toBe(false);
  });

  it("본문에 넣어 둔 data: 이미지는 기본으로도 보인다", () => {
    const r = clean('<img src="data:image/png;base64,iVBORw0KGgo=" alt="로고">');
    expect(r.html).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(r.remoteImagesBlocked).toBe(false);
  });

  it("허용해도 javascript: 이미지는 안 된다", () => {
    expect(clean('<img src="javascript:alert(1)">', true).html).not.toMatch(/javascript/i);
  });

  it("//로 시작하는 주소(프로토콜 생략)도 원격 이미지로 막는다", () => {
    const r = clean('<img src="//track.test/p.gif">');
    expect(r.html).not.toContain("track.test");
  });

  it("처리하지 못한 cid: 이미지는 제거한다", () => {
    expect(clean('<img src="cid:logo123">').html).not.toContain("cid:");
  });
});

describe("서식은 유지", () => {
  it("표·굵게·목록 같은 일반 서식은 그대로 둔다", () => {
    const { html } = clean("<table><tr><td><b>굵게</b></td></tr></table><ul><li>항목</li></ul><blockquote>인용</blockquote>");
    expect(html).toMatch(/<table>.*<b>굵게<\/b>.*<\/table>/s);
    expect(html).toContain("<li>항목</li>");
    expect(html).toContain("<blockquote>인용</blockquote>");
  });
});
