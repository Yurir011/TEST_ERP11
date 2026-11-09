import { useEffect } from "react";
import { logDebug } from "./logger";

// 파일 끌어다 놓기: 화면 어디서든 파일 첨부 칸 위로 파일을 끌어다 놓으면 그 칸의 파일 선택과 똑같이 동작한다.
// 각 화면의 <input type="file"> 을 고치지 않고, 놓은 자리에서 가장 가까운 파일 선택 칸을 찾아 파일을 넣고 change 를 알려 준다.

/** 놓은 요소에서 위로 올라가며, 파일 선택 칸이 정확히 하나만 들어 있는 가장 가까운 영역을 찾는다. (여러 칸이 섞인 넓은 영역은 어느 칸인지 알 수 없어 쓰지 않는다) */
export function findDropTarget(from: Element | null): { scope: Element; input: HTMLInputElement } | null {
  for (let el = from; el && el !== document.body; el = el.parentElement) {
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter((i) => !i.disabled);
    if (inputs.length === 1) return { scope: el, input: inputs[0] };
    if (inputs.length > 1) return null;
  }
  return null;
}

/** accept 속성(".pdf,image/*,application/pdf")에 맞는 파일인가. accept 가 비어 있으면 모두 허용한다. */
export function acceptsFile(file: Pick<File, "name" | "type">, accept: string): boolean {
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return tokens.some((t) => (t.startsWith(".") ? name.endsWith(t) : t.endsWith("/*") ? type.startsWith(t.slice(0, -1)) : type === t));
}

/** 놓은 파일 중 이 칸에 올릴 수 있는 것만 고른다. 여러 파일을 받지 않는 칸은 첫 파일 하나만 쓴다. */
export function pickDroppedFiles(files: File[], input: Pick<HTMLInputElement, "accept" | "multiple">): File[] {
  const ok = files.filter((f) => acceptsFile(f, input.accept));
  return input.multiple ? ok : ok.slice(0, 1);
}

/** 고른 파일을 파일 선택 칸에 넣고 change 를 알려 화면이 직접 고른 것처럼 처리하게 한다. */
export function fillFileInput(input: HTMLInputElement, files: File[]): void {
  const transfer = new DataTransfer();
  for (const f of files) transfer.items.add(f);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** 클립보드에 든 이미지(캡처 등)를 파일 이름을 붙여 돌려준다. 이미지가 없으면 빈 배열. */
export function imagesFromClipboard(data: Pick<DataTransfer, "files"> | null | undefined, now: Date = new Date()): File[] {
  const stamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return Array.from(data?.files ?? [])
    .filter((f) => f.type.startsWith("image/"))
    .map((f, i) => new File([f], `붙여넣은 이미지_${stamp}${i ? `_${i + 1}` : ""}.${IMAGE_EXT[f.type] ?? "png"}`, { type: f.type }));
}

/**
 * 붙여 넣은 이미지를 받을 파일 선택 칸을 고른다. 어느 칸인지 분명할 때만 고르고, 애매하면 null (엉뚱한 칸에 올리지 않는다).
 * 1) 지금 초점이 있는 곳에서 가장 가까운, 파일 칸이 하나뿐인 영역  2) 화면(열린 창이 있으면 그 창) 안에서 이미지를 받는 파일 칸이 하나뿐일 때 그 칸
 */
export function findPasteTarget(active: Element | null, root: ParentNode = document): HTMLInputElement | null {
  const image = { name: "image.png", type: "image/png" };
  if (active && active !== document.body) {
    const near = findDropTarget(active);
    if (near && acceptsFile(image, near.input.accept)) return near.input;
  }
  const overlays = Array.from(root.querySelectorAll(".fixed.inset-0, [role='dialog']"));
  const top = overlays[overlays.length - 1];
  const inputs = Array.from((top ?? root).querySelectorAll<HTMLInputElement>('input[type="file"]')).filter((i) => !i.disabled && acceptsFile(image, i.accept));
  return inputs.length === 1 ? inputs[0] : null;
}

const isTextEditing = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== "file") || (el as HTMLElement).isContentEditable);

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
const ACTIVE_ATTR = "data-drop-active";

/** 앱 전체에 파일 끌어다 놓기를 켠다 (App 에서 한 번만 호출). 파일 첨부 칸이 없는 곳에 놓아도 브라우저가 파일을 열어 버리지 않게 막는다. */
export function useFileDrop(): void {
  useEffect(() => {
    let active: Element | null = null;
    const setActive = (el: Element | null) => {
      if (active === el) return;
      active?.removeAttribute(ACTIVE_ATTR);
      el?.setAttribute(ACTIVE_ATTR, "");
      active = el;
    };

    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault(); // 놓을 수 있다고 알린다 (이게 없으면 drop 이 오지 않고 브라우저가 파일을 연다)
      const target = findDropTarget(e.target as Element | null);
      if (e.dataTransfer) e.dataTransfer.dropEffect = target ? "copy" : "none";
      setActive(target?.scope ?? null);
    }

    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setActive(null);
      const target = findDropTarget(e.target as Element | null);
      if (!target) return;
      const files = pickDroppedFiles(Array.from(e.dataTransfer?.files ?? []), target.input);
      logDebug("FileDrop", `파일 놓기: ${files.length}개 사용 (놓은 ${e.dataTransfer?.files.length ?? 0}개 중)`);
      if (files.length > 0) fillFileInput(target.input, files);
    }

    // Ctrl+V 로 복사한 스크린샷을 붙여 넣으면 화면의 파일 첨부 칸에 올린다 (영수증·거래명세서·세금계산서 사진·품의서 첨부 등 모든 첨부 칸).
    // 스스로 붙여넣기를 처리하는 곳(메신저)이나 글자와 함께 복사한 경우(엑셀 셀 등)는 건드리지 않는다.
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented) return;
      const images = imagesFromClipboard(e.clipboardData);
      if (images.length === 0) return;
      if (isTextEditing(document.activeElement) && e.clipboardData?.types.includes("text/plain")) return;
      const input = findPasteTarget(document.activeElement);
      if (!input) {
        logDebug("FilePaste", "붙여넣은 이미지를 받을 첨부 칸이 분명하지 않아 무시");
        return;
      }
      const files = pickDroppedFiles(images, input);
      if (files.length === 0) return;
      e.preventDefault();
      logDebug("FilePaste", `이미지 붙여넣기: ${files.length}개 첨부 (${files.map((f) => f.name).join(", ")})`);
      fillFileInput(input, files);
    }

    const clear = () => setActive(null);
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) clear(); // 창 밖으로 나가면 표시를 지운다
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragend", clear);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragend", clear);
      clear();
    };
  }, []);
}
