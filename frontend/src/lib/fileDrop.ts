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

    const clear = () => setActive(null);
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) clear(); // 창 밖으로 나가면 표시를 지운다
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragend", clear);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragend", clear);
      clear();
    };
  }, []);
}
