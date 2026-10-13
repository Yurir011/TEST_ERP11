import { logDebug } from "./logger";

/**
 * 모든 입력 폼(<form>)에서 엔터키를 "다음 칸으로 이동"으로 동작하게 한다 (탭키는 브라우저 기본 동작).
 * - 마지막 칸에서 엔터를 누르면 기본 동작대로 폼이 제출(확인/Go)된다.
 * - 여러 줄 입력(textarea)은 엔터가 줄바꿈이므로 건드리지 않고, Ctrl+Enter로 제출한다.
 * - 한글 조합(IME) 중 엔터, Shift/Alt/Ctrl 조합, 버튼 위의 엔터는 건드리지 않는다.
 * - 특정 폼에서 끄려면 <form data-no-enter-nav> 를 붙인다.
 * 앱 시작 시 한 번만 호출하면 되며, 화면별로 코드를 추가할 필요가 없다.
 */

const SKIP_INPUT_TYPES = new Set(["button", "submit", "reset", "image", "file", "hidden"]);

function isFocusableField(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) return false;
  if (el.disabled || el.tabIndex < 0) return false;
  if (el instanceof HTMLInputElement && el.readOnly) return false;
  return el.getClientRects().length > 0; // display:none 등으로 안 보이는 칸은 건너뛴다
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key !== "Enter" || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;

  const target = e.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  const form = target.form;
  if (!form || form.hasAttribute("data-no-enter-nav")) return;

  if (target instanceof HTMLTextAreaElement) {
    // 줄바꿈은 그대로 두고, Ctrl+Enter(또는 Cmd+Enter)로 제출한다.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      logDebug("EnterNav", "textarea에서 Ctrl+Enter → 폼 제출");
      form.requestSubmit();
    }
    return;
  }
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  if (target instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(target.type)) return;

  const fields = Array.from(form.elements).filter(isFocusableField);
  const index = fields.indexOf(target);
  if (index === -1) return;

  const next = fields[index + 1];
  if (!next) {
    // 마지막 칸: 기본 동작(폼 제출)을 그대로 둔다. 제출 버튼이 없는 폼이면 직접 제출한다.
    logDebug("EnterNav", "마지막 칸에서 Enter → 폼 제출");
    if (!form.querySelector('button[type="submit"], input[type="submit"], button:not([type])')) {
      e.preventDefault();
      form.requestSubmit();
    }
    return;
  }

  e.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement && next.type !== "checkbox" && next.type !== "radio") next.select?.();
}

let installed = false;

export function installEnterAsTab() {
  if (installed) return;
  installed = true;
  // 버블 단계에 등록해 React 핸들러가 이미 처리(preventDefault)한 엔터는 건드리지 않는다.
  document.addEventListener("keydown", handleKeyDown);
  logDebug("EnterNav", "엔터키 다음칸 이동 기능 설치");
}
