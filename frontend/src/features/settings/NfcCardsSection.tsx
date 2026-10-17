import { CreditCard, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { NFC_STATE_LABELS, getBenchClient, type NfcReaderStatus } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { cardTitle, isUidReady, normalizeUid, uidError, type NfcCard } from "./nfcCards";

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "-";
}

/** 직원 수정 화면의 "NFC 카드" 칸: 등록된 카드 목록, 카드 읽기(데스크톱 앱) 또는 번호 직접 입력(브라우저), 사용 중지·삭제. */
export function NfcCardsSection({ userId, userName }: { userId: number; userName: string }) {
  const dialog = useDialog();
  const bench = getBenchClient();

  const [cards, setCards] = useState<NfcCard[] | null>(null);
  const [uid, setUid] = useState("");
  const [fromReader, setFromReader] = useState(false); // 번호를 리더에서 읽었는가 (읽은 번호는 화면에 그대로 보이지 않게 한다)
  const [label, setLabel] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [reader, setReader] = useState<NfcReaderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    logDebug("NfcCards", `카드 목록 조회: user_id=${userId}`);
    apiGet<NfcCard[]>(`/api/users/${userId}/nfc-cards`)
      .then(setCards)
      .catch((err) => {
        logError("NfcCards", "목록 조회 실패", err);
        setError("카드 목록을 불러오지 못했습니다.");
      });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // 데스크톱 앱: 리더 상태를 보여 주고, "카드 읽기" 중일 때 닿은 카드의 번호를 받는다
  useEffect(() => {
    if (!bench) return;
    void bench.nfc.status().then(setReader);
    return bench.nfc.onStatus(setReader);
  }, [bench]);

  useEffect(() => {
    if (!bench || !waiting) return;
    return bench.nfc.onCard((card) => {
      logDebug("NfcCards", `리더에서 카드 읽음: 끝 4자리 ${card.uid.slice(-4)}`);
      setUid(card.uid);
      setFromReader(true);
      setWaiting(false);
      setError(null);
    });
  }, [bench, waiting]);

  function changeUid(value: string) {
    setUid(value);
    setFromReader(false);
    setError(null);
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!isUidReady(uid)) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/users/${userId}/nfc-cards`, { uid: normalizeUid(uid), label: label.trim() });
      setUid("");
      setLabel("");
      setFromReader(false);
      dialog.notify("카드를 등록했습니다.");
      load();
    } catch (err) {
      logError("NfcCards", "카드 등록 실패", err);
      setError(err instanceof ApiError ? err.message : "카드 등록 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate(card: NfcCard) {
    if (!(await dialog.confirm(`'${cardTitle(card)}' 카드를 사용 중지할까요?\n이 카드로는 더 이상 로그인할 수 없습니다.`, { okLabel: "사용 중지", danger: true }))) return;
    try {
      await apiPut(`/api/users/${userId}/nfc-cards/${card.id}/deactivate`);
      load();
    } catch (err) {
      logError("NfcCards", "사용 중지 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "사용 중지 중 오류가 발생했습니다.");
    }
  }

  async function handleDelete(card: NfcCard) {
    if (!(await dialog.confirm(`'${cardTitle(card)}' 카드를 삭제할까요?\n삭제하면 이 카드를 다른 직원에게 다시 등록할 수 있습니다.`, { okLabel: "삭제", danger: true }))) return;
    try {
      await apiDelete(`/api/users/${userId}/nfc-cards/${card.id}`);
      load();
    } catch (err) {
      logError("NfcCards", "삭제 실패", err);
      dialog.notifyError(err instanceof ApiError ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  const inputError = fromReader ? null : uidError(uid);
  const readerReady = reader?.state === "ready";

  return (
    <section className="bg-surface border border-border rounded-2xl p-6 space-y-4 max-w-xl mt-6" aria-label="NFC 카드">
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-text-muted" />
        <h2 className="text-sm font-semibold">
          NFC 카드 <span className="text-text-muted font-normal">· {userName}</span>
        </h2>
      </div>
      <p className="text-xs text-text-muted">
        이 직원({userName})의 카드만 이 목록에 표시됩니다. 등록한 카드를 승인된 데스크톱 앱의 리더에 대면 이 직원으로 로그인됩니다. 카드 번호는 암호화되어 저장되고, 화면에는 끝 4자리만 표시됩니다.
      </p>

      {cards === null ? (
        <p className="text-xs text-text-muted">불러오는 중...</p>
      ) : cards.length === 0 ? (
        <p className="text-xs text-text-muted">등록된 카드가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {c.label || "이름 없음"} <span className="text-text-muted font-normal">…{c.uid_last4}</span>
                </div>
                <div className="text-xs text-text-muted">
                  등록 {formatDate(c.registered_at)} · 마지막 사용 {formatDate(c.last_used_at)}
                </div>
              </div>
              <span className={`px-2 py-0.5 text-xs ${c.is_active ? SOFT_BADGE.green : SOFT_BADGE.gray}`}>{c.is_active ? "사용 중" : "중지됨"}</span>
              {c.is_active && (
                <button type="button" onClick={() => handleDeactivate(c)} className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-bg">
                  사용 중지
                </button>
              )}
              <button type="button" title="카드 삭제" aria-label={`${cardTitle(c)} 삭제`} onClick={() => handleDelete(c)} className="text-text-muted hover:text-danger p-1">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleRegister} className="space-y-3 border-t border-border pt-4">
        <div className="text-xs font-medium">카드 등록</div>

        {bench ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={!readerReady || waiting}
              onClick={() => {
                setUid("");
                setFromReader(false);
                setWaiting(true);
              }}
              className="rounded-lg border border-primary text-primary text-sm font-medium px-3.5 py-2 hover:bg-tile-blue disabled:opacity-50"
            >
              {waiting ? "카드를 리더에 대세요..." : "카드 읽기"}
            </button>
            {waiting && (
              <button type="button" onClick={() => setWaiting(false)} className="text-xs text-text-muted hover:text-text">
                취소
              </button>
            )}
            <span className={`text-xs ${readerReady ? "text-text-muted" : "text-danger"}`}>{reader ? NFC_STATE_LABELS[reader.state] : "리더 상태 확인 중..."}</span>
          </div>
        ) : (
          <p className="text-xs text-text-muted">데스크톱 앱이 아니라서 카드 번호를 직접 입력합니다.</p>
        )}

        {fromReader ? (
          <p className="text-sm">
            카드를 읽었습니다 <span className="text-text-muted">(끝 4자리 {normalizeUid(uid).slice(-4)})</span>{" "}
            <button type="button" onClick={() => changeUid("")} className="text-xs text-text-muted underline">
              지우기
            </button>
          </p>
        ) : (
          <div>
            <input
              value={uid}
              onChange={(e) => changeUid(e.target.value)}
              placeholder="카드 번호 (예: 0B9F515D)"
              autoComplete="off"
              spellCheck={false}
              aria-label="카드 번호"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg font-mono"
            />
            {inputError && <p className="text-xs text-danger mt-1">{inputError}</p>}
          </div>
        )}

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={50}
          placeholder="카드 이름 (예: 사원증)"
          aria-label="카드 이름"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
        />

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy || !isUidReady(uid)}
          className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
        >
          {busy ? "등록 중..." : "카드 등록"}
        </button>
      </form>
    </section>
  );
}
