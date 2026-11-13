import { logDebug } from "./logger";

// 첨부파일 미리보기: openFile 이 받은 파일을 새 탭이 아니라 화면 위 팝업(FilePreviewHost)으로 보여 준다.
// 팝업을 그리는 쪽(FilePreviewHost)이 켜져 있을 때만 쓰고, 없으면 호출한 쪽이 예전처럼 새 창으로 연다 (모바일 화면 등).

export interface PreviewRequest {
  blob: Blob;
  filename: string;
  /** 팝업 안에서 받기 버튼을 눌렀을 때 쓸 원래 경로 (없으면 지금 받은 파일을 그대로 저장) */
  path?: string;
}

export type PreviewKind = "image" | "pdf" | "text" | "other";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const TEXT_EXT = ["txt", "xml", "csv", "json", "log", "md"];
const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** 파일 이름(과 서버가 알려 준 형식)으로 팝업 안에서 어떻게 보여 줄지 정한다 */
export function previewKind(filename: string, mime = ""): PreviewKind {
  const ext = extensionOf(filename);
  if (IMAGE_EXT.includes(ext) || mime.startsWith("image/")) return "image";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (TEXT_EXT.includes(ext) || mime.startsWith("text/")) return "text";
  return "other";
}

export const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

let listener: ((req: PreviewRequest) => void) | null = null;

/** FilePreviewHost 가 켜질 때 등록한다 (꺼질 때 null) */
export function registerFilePreview(fn: ((req: PreviewRequest) => void) | null): void {
  listener = fn;
}

/** 팝업이 켜져 있으면 미리보기를 띄우고 true, 아니면 false (호출한 쪽이 새 창으로 연다) */
export function showFilePreview(req: PreviewRequest): boolean {
  if (!listener) return false;
  logDebug("FilePreview", `미리보기 열기: ${req.filename} (${req.blob.size}바이트)`);
  listener(req);
  return true;
}

/** Content-Disposition 헤더에서 파일 이름을 꺼낸다 (filename*=UTF-8''... 우선) */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* 아래로 */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}
