// 메시지 글에서 http(s) 주소를 링크로 바꾼다. HTML 문자열을 만들지 않고 조각 목록을 돌려주므로, 화면에서 요소로 그리면
// 글 안의 <script> 같은 것이 실행될 길이 없다. javascript:, data: 등은 링크로 만들지 않는다.

export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?)\]}>'"]+$/;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let url = match[0];
    const start = match.index ?? 0;
    // 문장 끝의 마침표·괄호 등은 주소에 넣지 않는다 (단, 주소 안에 짝이 맞는 괄호가 있으면 유지)
    for (;;) {
      const trimmed = url.replace(TRAILING, "");
      if (trimmed === url) break;
      if (url.endsWith(")") && (url.match(/\(/g) ?? []).length >= (url.match(/\)/g) ?? []).length) break;
      url = trimmed;
    }
    if (!isSafeHttpUrl(url)) continue;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", value: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}
