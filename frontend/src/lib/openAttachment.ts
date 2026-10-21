import { downloadFile, fetchFileBytes, openFile } from "./api";
import { getBenchClient } from "./desktop";
import { logDebug } from "./logger";

/** 브라우저가 새 창에서 바로 보여 줄 수 있는 형식 (사진·PDF·텍스트) */
const VIEWABLE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "pdf", "txt"];

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export const isViewableInBrowser = (name: string) => VIEWABLE_EXTENSIONS.includes(extensionOf(name));

/**
 * 첨부파일을 눌렀을 때 바로 연다.
 *  - 사진·PDF·텍스트: 새 창에서 바로 보여 준다.
 *  - 엑셀·워드·한글 등 문서: 데스크톱 앱에서는 이 PC의 기본 프로그램으로 바로 열고,
 *    웹 브라우저는 문서를 직접 열 수 없어 내려받는다 (받은 파일을 누르면 열린다).
 */
export async function openAttachment(path: string, filename: string): Promise<void> {
  if (isViewableInBrowser(filename)) {
    logDebug("OpenAttachment", `새 창으로 열기: ${filename}`);
    return openFile(path);
  }
  const bench = getBenchClient();
  if (bench?.openFile) {
    logDebug("OpenAttachment", `앱의 기본 프로그램으로 열기: ${filename}`);
    const result = await bench.openFile(filename, await fetchFileBytes(path));
    if (!result.ok) throw new Error(result.error ?? "파일을 열지 못했습니다.");
    return;
  }
  logDebug("OpenAttachment", `내려받기(브라우저는 이 형식을 직접 열 수 없음): ${filename}`);
  return downloadFile(path, filename);
}
