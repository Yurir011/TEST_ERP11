import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { NFC_STATE_LABELS, getBenchClient, type NfcLoginResult, type NfcReaderStatus } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { useNfcMode } from "../../lib/nfcMode";

/**
 * 로그인 화면의 "카드로 로그인" 칸. 데스크톱 앱에서만 나타난다 (브라우저에는 benchClient 가 없다).
 * 카드를 대면 앱이 이 PC 의 승인된 기기 키로 서버에 로그인을 요청하고, 이 칸은 결과(토큰 또는 안내 문구)만 받는다.
 */
export function NfcLoginPanel({ onToken }: { onToken: (token: string) => Promise<void> }) {
  const bench = getBenchClient();
  const [reader, setReader] = useState<NfcReaderStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useNfcMode("login", true);

  useEffect(() => {
    if (!bench) return;
    void bench.nfc.status().then(setReader);
    return bench.nfc.onStatus(setReader);
  }, [bench]);

  useEffect(() => {
    if (!bench) return;
    return bench.nfc.onLogin((result: NfcLoginResult) => {
      if (!result.ok) {
        logDebug("NfcLogin", `카드 로그인 거절: ${result.error}`);
        setMessage(result.error);
        return;
      }
      setMessage(null);
      setWorking(true);
      onToken(result.token)
        .catch((err) => {
          logError("NfcLogin", "카드 로그인 토큰 확인 실패", err);
          setMessage("로그인 정보를 확인하지 못했습니다. 카드를 다시 대세요.");
        })
        .finally(() => setWorking(false));
    });
  }, [bench, onToken]);

  if (!bench) return null;

  const ready = reader?.state === "ready";
  return (
    <div className="mt-6 pt-5 border-t border-border" aria-label="카드로 로그인">
      <div className="flex items-center gap-2 mb-1.5">
        <CreditCard size={15} className="text-text-muted" />
        <span className="text-xs font-medium">카드로 로그인</span>
      </div>
      {working ? (
        <p className="text-xs text-text-muted">로그인 중...</p>
      ) : ready ? (
        <p className="text-xs text-text-muted">등록된 카드를 리더에 대면 바로 로그인됩니다.</p>
      ) : (
        <p className="text-xs text-danger">{reader ? NFC_STATE_LABELS[reader.state] : "리더 상태 확인 중..."} — 카드 로그인을 쓸 수 없습니다.</p>
      )}
      {message && (
        <p className="text-xs text-danger mt-1.5" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
