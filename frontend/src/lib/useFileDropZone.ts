import { useEffect, useRef, useState, type DragEvent } from "react";
import { fillFileInput, imagesFromClipboard, pickDroppedFiles } from "./fileDrop";
import { logDebug } from "./logger";

/**
 * 한 칸(박스)이 직접 파일 끌어다 놓기와 이미지 붙여넣기(Ctrl+V)를 받게 한다.
 * 받은 파일은 박스 안 파일 선택 칸에 넣고 change 를 알려, 직접 고른 것과 똑같이 처리된다.
 * 앱 전체 기능(useFileDrop)은 열어 둔 다른 탭의 첨부 칸 때문에 붙여넣기 대상을 못 정할 수 있어, 이 칸이 스스로 처리한다.
 * 다른 탭에 가려진 화면이면 붙여넣기를 받지 않고, 이미 다른 곳이 처리했으면 건너뛴다.
 */
export function useFileDropZone(tag: string) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(files: File[]) {
    if (!input.current) return;
    const ok = pickDroppedFiles(files, input.current);
    if (ok.length === 0) return;
    fillFileInput(input.current, ok);
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented || !box.current || box.current.offsetParent === null) return;
      const images = imagesFromClipboard(e.clipboardData);
      if (images.length === 0) return;
      const el = document.activeElement;
      const typing = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== "file") || (el as HTMLElement | null)?.isContentEditable;
      if (typing && e.clipboardData?.types.includes("text/plain")) return;
      e.preventDefault();
      logDebug(tag, `이미지 붙여넣기: ${images.length}개`);
      addFiles(images);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  const handlers = {
    onDragOver: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault(); // 이 칸이 직접 처리한다 (앱 전체 끌어다 놓기가 또 올리지 않도록)
      setDragOver(false);
      logDebug(tag, `파일 끌어다 놓기: ${e.dataTransfer.files.length}개`);
      addFiles(Array.from(e.dataTransfer.files));
    },
  };

  return { box, input, dragOver, handlers };
}
