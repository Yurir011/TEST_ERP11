import { createContext, useContext } from "react";

// 화면 안의 확인 창·입력 창·알림 (브라우저 기본 window.confirm / prompt / alert 대신).
// 확인과 입력은 가운데 창으로 묻고, 완료 안내는 오른쪽 아래 알림으로 잠깐 띄운다(오류는 닫을 때까지 남는다).
// Provider(DialogProvider.tsx)와 파일을 나눠, 컴포넌트 파일이 컴포넌트만 내보내게 한다.

export interface ConfirmOptions {
  /** 확인 버튼 문구 (기본 "확인") */
  okLabel?: string;
  /** 되돌릴 수 없는 일(삭제 등)이면 확인 버튼을 빨간색으로, 처음 초점은 [취소]에 둔다 */
  danger?: boolean;
}

export interface PromptOptions {
  okLabel?: string;
  danger?: boolean;
  placeholder?: string;
}

export interface DialogApi {
  /** 확인하면 true, 취소하면 false */
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  /** 입력한 글(앞뒤 공백 그대로), 취소하면 null */
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
  /** 완료 안내: 오른쪽 아래에 4초 동안 */
  notify: (message: string) => void;
  /** 오류 안내: 직접 닫을 때까지 */
  notifyError: (message: string) => void;
}

export const DialogContext = createContext<DialogApi | undefined>(undefined);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
