/**
 * 받은 메일의 HTML 을 화면에 보여 주기 전에 정리한다 (main 프로세스).
 * 스크립트·프레임·폼·스타일 태그·이벤트 속성을 모두 없애고, 원격 이미지(추적용 픽셀 포함)는 사용자가 허용하기 전까지 막는다.
 * 화면 쪽에서는 이 결과를 다시 sandbox iframe + CSP 안에서만 보여 준다 (이중 방어).
 */
import sanitizeHtml from "sanitize-html";

export interface SanitizeOptions {
  /** 원격(http/https) 이미지를 허용하는가. 기본 false */
  allowRemoteImages?: boolean;
}

export interface SanitizeResult {
  html: string;
  /** 허용하지 않아 제거한 원격 이미지가 있었는가 */
  remoteImagesBlocked: boolean;
}

// 값에 함수 호출(url(), expression() 등)이 들어간 스타일은 버린다. rgb()/rgba()/hsl() 색상만 예외.
const SAFE_VALUE = /^(?!.*(?:url|expression|javascript|behavior|@import|-moz-binding)).*$/i;
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]*\)$/i;
const safeStyle = [SAFE_VALUE];
const colorStyle = [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i, COLOR_FN];

const ALLOWED_STYLES = {
  "*": {
    color: colorStyle,
    "background-color": colorStyle,
    "font-size": safeStyle,
    "font-weight": safeStyle,
    "font-style": safeStyle,
    "font-family": safeStyle,
    "text-align": safeStyle,
    "text-decoration": safeStyle,
    "line-height": safeStyle,
    "vertical-align": safeStyle,
    "white-space": safeStyle,
    width: safeStyle,
    height: safeStyle,
    "max-width": safeStyle,
    margin: safeStyle,
    "margin-top": safeStyle,
    "margin-bottom": safeStyle,
    "margin-left": safeStyle,
    "margin-right": safeStyle,
    padding: safeStyle,
    "padding-top": safeStyle,
    "padding-bottom": safeStyle,
    "padding-left": safeStyle,
    "padding-right": safeStyle,
    border: safeStyle,
    "border-top": safeStyle,
    "border-bottom": safeStyle,
    "border-left": safeStyle,
    "border-right": safeStyle,
    "border-collapse": safeStyle,
    "border-color": colorStyle,
  },
};

const ALLOWED_TAGS = [
  "a", "abbr", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup", "dd", "div", "dl", "dt", "em", "font", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "li", "ol", "p", "pre", "s", "small", "span", "strike", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const LAYOUT_ATTRS = ["align", "valign", "bgcolor", "width", "height", "colspan", "rowspan", "cellpadding", "cellspacing", "border", "color", "size", "face", "dir", "lang", "style"];

export function sanitizeEmailHtml(html: string, options: SanitizeOptions = {}): SanitizeResult {
  let blocked = false;
  const allowRemote = options.allowRemoteImages === true;

  const out = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel", ...LAYOUT_ATTRS],
      img: ["src", "alt", "title", ...LAYOUT_ATTRS],
      "*": LAYOUT_ATTRS,
    },
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: allowRemote ? ["data", "http", "https"] : ["data"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    // 위험한 태그는 안쪽 글자까지 통째로 버린다 (<script>, <style> 의 내용이 글자로 새어 나오지 않게)
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "template", "svg", "math"],
    transformTags: {
      a: (_tag, attribs) => {
        const href = attribs.href ?? "";
        const next: Record<string, string> = { target: "_blank", rel: "noopener noreferrer" };
        if (href) {
          next.href = href;
          // 눈에 보이는 글자와 실제 주소가 다른 링크를 알아볼 수 있게 주소를 title 로 달아 준다 (허용되는 주소 형식만)
          if (/^(?:https?:|mailto:|tel:)/i.test(href.trim())) next.title = href.slice(0, 300);
        }
        for (const k of Object.keys(attribs)) if (!(k in next) && k !== "href" && k !== "target" && k !== "rel") next[k] = attribs[k];
        return { tagName: "a", attribs: next };
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag !== "img") return false;
      const src = frame.attribs.src;
      if (!src) {
        // sanitize 단계에서 허용되지 않는 주소(원격 이미지, cid:, javascript: 등)는 src 가 지워진다.
        // 원래 주소가 있었는지는 알 수 없으므로 표식으로 구분하지 않고, 원격 차단 여부는 아래에서 원문을 보고 판단한다.
        return true;
      }
      return false;
    },
  });

  if (!allowRemote) blocked = /<img\b[^>]*\bsrc\s*=\s*["']?\s*https?:\/\//i.test(html);
  return { html: out, remoteImagesBlocked: blocked };
}
