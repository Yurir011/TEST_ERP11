// 메일 HTML 을 가두어 보여 줄 때 쓰는 문서·권한 설정 (MailHtmlFrame 에서 사용)

export function buildMailDocument(html: string, allowRemoteImages: boolean): string {
  const img = allowRemoteImages ? "data: https: http:" : "data:";
  const csp = `default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<base target="_blank">',
    "<style>body{margin:12px;font:14px/1.5 -apple-system,'Segoe UI','Malgun Gothic',sans-serif;color:#1f2024;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #d8d8dc;color:#555}a{color:#2563eb}</style>",
    "</head><body>",
    html,
    "</body></html>",
  ].join("");
}

export const MAIL_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
