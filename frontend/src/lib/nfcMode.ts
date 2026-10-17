import { useEffect } from "react";
import { getBenchClient, type NfcMode } from "./desktop";

// 데스크톱 앱에 "카드가 닿으면 무엇을 할지"를 알린다. 여러 화면이 동시에 요청할 수 있어 (로그인 화면, 카드 등록 중인 직원 화면)
// 우선순위로 하나를 고른다: 카드 등록(capture) > 로그인(login) > 아무것도 안 함(off).
// 카드 등록 중에 카드가 닿아도 로그인이 일어나지 않고, 등록이 끝나면 원래 모드로 돌아간다.

const PRIORITY: Record<NfcMode, number> = { off: 0, login: 1, capture: 2 };

/** 요청된 모드들 중 하나를 고른다 (요청이 없으면 off) */
export function resolveNfcMode(requested: Iterable<NfcMode>): NfcMode {
  let best: NfcMode = "off";
  for (const m of requested) if (PRIORITY[m] > PRIORITY[best]) best = m;
  return best;
}

const requests = new Map<symbol, NfcMode>();

function apply() {
  const bench = getBenchClient();
  if (!bench) return;
  void bench.nfc.setMode(resolveNfcMode(requests.values())).catch(() => undefined);
}

/** enabled 인 동안 mode 를 요청한다. 데스크톱 앱이 아니면 아무 일도 하지 않는다. */
export function useNfcMode(mode: Exclude<NfcMode, "off">, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !getBenchClient()) return;
    const id = Symbol(mode);
    requests.set(id, mode);
    apply();
    return () => {
      requests.delete(id);
      apply();
    };
  }, [mode, enabled]);
}
