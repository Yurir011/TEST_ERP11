import { ApiError, apiPut } from "./api";
import { logDebug, logError } from "./logger";
import { useDialog } from "../components/ui/dialog/useDialog";

type DecisionKind = "approve" | "reject";

interface ApprovalActionOptions<T> {
  /** 로그 접두사 (예: "Leaves") */
  module: string;
  getId: (item: T) => number;
  /** 결재 대상의 API 기본 경로. `${basePath(id)}/approve`, `/reject` 로 호출한다. */
  basePath: (id: number) => string;
  /** 승인 전에 확인창으로 물어볼 문구. 반환값이 없으면 확인 없이 바로 승인한다. */
  confirmApprove?: (item: T) => string | undefined;
  /** 처리 중인 대상 id 표시 (버튼 비활성화용). 화면의 다른 작업(다운로드 등)과 같은 상태를 공유하므로 화면이 소유한 setter 를 넘긴다. */
  setBusyId: (id: number | null) => void;
  /** 승인/반려가 서버에 반영된 직후 (목록 새로고침, 모달 닫기 등). 승인 안내창보다 먼저 실행된다. */
  onDone: (kind: DecisionKind) => void;
  /** 안내창까지 끝난 뒤 실행된다 (예: 호출한 쪽에 결재 완료를 알림). */
  onAfter?: (kind: DecisionKind) => void;
  /** 실패했을 때 화면에 보여줄 메시지를 받는다. 넘기지 않으면 로그만 남긴다. */
  onError?: (message: string) => void;
}

/**
 * 결재 승인/반려 버튼의 공통 동작: 승인 확인 → API 호출 → 처리 중 표시 → 승인 안내 / 반려 사유 입력.
 * 연차·증명서·품의서·프로젝트 문서 화면이 같은 흐름을 쓴다.
 */
export function useApprovalActions<T>(options: ApprovalActionOptions<T>) {
  const { confirm, prompt, notify } = useDialog();
  const { module, getId, basePath, confirmApprove, setBusyId, onDone, onAfter, onError } = options;

  function fail(kind: DecisionKind, err: unknown) {
    const label = kind === "approve" ? "승인" : "반려";
    logError(module, `결재 ${label} 실패`, err);
    onError?.(err instanceof ApiError ? err.message : `결재 ${label} 중 오류가 발생했습니다.`);
  }

  async function approve(item: T) {
    const confirmMessage = confirmApprove?.(item);
    if (confirmMessage && !(await confirm(confirmMessage, { okLabel: "승인" }))) return;
    const id = getId(item);
    logDebug(module, `결재 승인 시도: id=${id}`);
    setBusyId(id);
    try {
      await apiPut(`${basePath(id)}/approve`);
      onDone("approve");
      notify("결재 승인되었습니다.");
      onAfter?.("approve");
    } catch (err) {
      fail("approve", err);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(item: T) {
    const reason = await prompt("반려 사유를 입력해주세요.", { okLabel: "반려", danger: true });
    if (!reason || !reason.trim()) return;
    const id = getId(item);
    logDebug(module, `결재 반려 시도: id=${id}`);
    setBusyId(id);
    try {
      await apiPut(`${basePath(id)}/reject`, { reason: reason.trim() });
      onDone("reject");
      onAfter?.("reject");
    } catch (err) {
      fail("reject", err);
    } finally {
      setBusyId(null);
    }
  }

  return { approve, reject };
}
