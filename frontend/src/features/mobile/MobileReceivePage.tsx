import { Camera, PackageCheck, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiPut, apiUploadForm } from "../../lib/api";
import { todayISO } from "../../lib/date";
import { logDebug, logError } from "../../lib/logger";
import { CodeText } from "../materials/CodeText";
import { QtyInput, emptyQty, qtyPayload, type QtyState } from "../materials/QtyInput";
import { classLabel, matchKeyword, type Material, type QtyPayload } from "../materials/types";
import { usePaymentAccounts } from "../payments/paymentAccounts";
import { PaymentPicker, paymentFromProposal, paymentLabel, type OrderPayment } from "../proposals/PaymentPicker";
import type { Proposal } from "../proposals/types";
import { MobileCard, MobileEmpty, MobileLayout } from "./MobileLayout";

interface Line {
  key: number;
  material: Material | null;
  qty: QtyState;
}

let lineKey = 0;
const newLine = (): Line => ({ key: ++lineKey, material: null, qty: emptyQty() });

/** 입고 대기: 승인된 구매 품의서 중 발주(발송 확인)가 끝났고 아직 입고하지 않은 건 */
const waiting = (p: Proposal) => p.kind === "구매" && p.status === "approved" && !!p.order_sent_at && !p.received_at;

/**
 * 모바일 입고 처리: 전자결재의 입고 대기 구매 품의서를 고르고, 받은 날·자재별 수량·사진을 적어 입고 완료한다.
 * 서버의 입고 확인 API 를 그대로 쓰므로 PC 전자결재 카드·자재 재고·매입이 함께 맞춰진다.
 */
export function MobileReceivePage() {
  usePaymentAccounts(); // 카드·계좌 이름이 로드되면 다시 그린다
  const [rows, setRows] = useState<Proposal[] | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Proposal | null>(null);
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [payment, setPayment] = useState<OrderPayment>({ payment_method: null, payment_card: null, payment_bank: null });
  const [payDate, setPayDate] = useState(todayISO());
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState<number | null>(null); // 자재를 고르는 중인 줄
  const [keyword, setKeyword] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    logDebug("MobileReceive", "입고 대기 목록 조회 시작");
    apiGet<Proposal[]>("/api/proposals")
      .then((r) => {
        const list = r.filter(waiting);
        logDebug("MobileReceive", `입고 대기 목록 조회 성공: ${list.length}건`);
        setRows(list);
      })
      .catch((err) => {
        logError("MobileReceive", "입고 대기 목록 조회 실패", err);
        setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
      });
  }

  useEffect(() => {
    load();
    apiGet<Material[]>("/api/materials")
      .then(setMaterials)
      .catch((err) => logError("MobileReceive", "자재 목록 조회 실패", err));
  }, []);

  const found = useMemo(() => (searchKey === null ? [] : materials.filter((m) => matchKeyword(m, keyword)).slice(0, 30)), [materials, keyword, searchKey]);

  function pick(p: Proposal) {
    setPicked(p);
    setDate(todayISO());
    setPayment(paymentFromProposal(p));
    setPayDate(todayISO());
    setLines([newLine()]);
    setPhotos([]);
    setError(null);
  }

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function confirm() {
    if (!picked) return;
    const used = lines.filter((l) => l.material);
    const stock: ({ material_id: number } & QtyPayload)[] = [];
    for (const l of used) {
      const q = qtyPayload(l.qty);
      if (!q) {
        setError(`'${l.material!.name}'의 수량을 입력해 주세요.`);
        return;
      }
      stock.push({ material_id: l.material!.id, ...q });
    }
    setBusy(true);
    setError(null);
    logDebug("MobileReceive", `입고 완료 시도: proposal=${picked.id}, 자재 ${stock.length}줄, 사진 ${photos.length}장`);
    try {
      await apiPut<Proposal>(`/api/proposals/${picked.id}/received`, {
        value: true,
        received_date: date,
        materials: stock,
        payment_asked: true,
        payment_date: payment.payment_method !== null ? payDate : undefined,
        ...payment,
      });
      let failed = 0;
      for (const f of photos) {
        const form = new FormData();
        form.append("file", f);
        try {
          await apiUploadForm<Proposal>(`/api/proposals/${picked.id}/attachments/file`, form);
        } catch (err) {
          failed += 1;
          logError("MobileReceive", "입고 사진 올리기 실패", err);
        }
      }
      logDebug("MobileReceive", `입고 완료 성공: proposal=${picked.id}, 사진 실패 ${failed}장`);
      setDone(`${picked.title} 입고 완료${failed ? ` (사진 ${failed}장은 올리지 못했습니다)` : ""}`);
      setPicked(null);
      load();
    } catch (err) {
      logError("MobileReceive", "입고 완료 실패", err);
      setError(err instanceof ApiError ? err.message : "입고 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileLayout title="입고" backTo={picked ? "/m/receive" : "/m"} hideTabs={!!picked}>
      {done && <p className="rounded-xl bg-tile-green text-tile-green-fg px-3 py-2 text-sm">{done}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}

      {!picked && (
        <>
          <p className="text-xs text-text-muted">전자결재에서 발주를 마친(입고 대기) 구매 품의서입니다. 받은 건을 눌러 주세요.</p>
          {rows === null && !error && <MobileEmpty text="불러오는 중..." />}
          {rows !== null && rows.length === 0 && <MobileEmpty text="입고 대기 중인 구매 품의서가 없습니다." />}
          <div className="space-y-2.5">
            {(rows ?? []).map((p) => (
              <button key={p.id} type="button" onClick={() => pick(p)} className="w-full text-left active:opacity-60">
                <MobileCard>
                  <p className="text-xs text-text-muted">{p.doc_no}</p>
                  <b className="block text-sm truncate">{p.title}</b>
                  <p className="text-xs text-text-muted truncate mt-0.5">{p.vendor_name ?? "거래처 없음"}</p>
                </MobileCard>
              </button>
            ))}
          </div>
        </>
      )}

      {picked && (
        <>
          <MobileCard>
            <p className="text-xs text-text-muted">{picked.doc_no}</p>
            <b className="block text-sm">{picked.title}</b>
            <p className="text-xs text-text-muted mt-0.5">{picked.vendor_name ?? "거래처 없음"}</p>
          </MobileCard>

          <MobileCard className="space-y-2">
            <label className="text-sm font-medium" htmlFor="receive-date">받은 날</label>
            <input id="receive-date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base" />
          </MobileCard>

          <MobileCard className="space-y-3">
            <p className="text-sm font-medium">재고에 넣을 자재 <span className="text-xs text-text-muted font-normal">(고르지 않은 줄은 재고에 반영하지 않음)</span></p>
            {lines.map((l) => (
              <div key={l.key} className="rounded-xl border border-border p-3 space-y-2">
                {l.material ? (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <CodeText code={l.material.code} small className="block truncate" />
                      <b className="block text-sm truncate">{l.material.name}</b>
                      <p className="text-xs text-text-muted truncate">{classLabel(l.material)} · 현재 {l.material.current_qty.toLocaleString()}개</p>
                    </div>
                    <button type="button" onClick={() => setLine(l.key, { material: null })} className="text-xs text-primary shrink-0">바꾸기</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setSearchKey(l.key); setKeyword(""); }} className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm text-primary">자재 선택</button>
                )}
                {l.material && <QtyInput label="입고" value={l.qty} onChange={(q) => setLine(l.key, { qty: q })} />}
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-xs text-text-muted">줄 삭제</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className="flex items-center gap-1 text-sm text-primary">
              <Plus size={14} /> 자재 줄 추가
            </button>
          </MobileCard>

          <MobileCard className="space-y-3">
            <p className="text-sm font-medium">대금을 결제하셨나요?</p>
            <p className="text-xs text-text-muted">결제 방법을 고르세요. 아직 결제 전이면 <b>외상</b>으로 처리되며, 결과는 매입매출·입출금에 반영됩니다.</p>
            <PaymentPicker value={payment} onChange={setPayment} />
            {payment.payment_method !== null && (
              <div className="border-t border-border pt-3 space-y-2">
                <label className="text-sm font-medium" htmlFor="pay-date">결제한 날</label>
                <input id="pay-date" type="date" max={todayISO()} value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base" />
              </div>
            )}
          </MobileCard>

          <MobileCard className="space-y-2">
            <p className="text-sm font-medium">사진 <span className="text-xs text-text-muted font-normal">(납품서·물품 사진, 품의서 첨부로 저장)</span></p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const f = Array.from(e.target.files ?? []);
                if (f.length) setPhotos((ps) => [...ps, ...f]);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              {photos.map((f, i) => (
                <div key={i} className="relative w-20 h-20">
                  <img src={URL.createObjectURL(f)} alt={`입고 사진 ${i + 1}`} className="w-20 h-20 rounded-lg object-cover border border-border" />
                  <button type="button" aria-label="사진 삭제" onClick={() => setPhotos((ps) => ps.filter((_, k) => k !== i))} className="absolute -top-1.5 -right-1.5 rounded-full bg-surface border border-border p-0.5">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-xs text-primary gap-1">
                <Camera size={20} /> 사진 추가
              </button>
            </div>
          </MobileCard>

          <button type="button" onClick={confirm} disabled={busy} className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-white py-3 text-base font-semibold disabled:opacity-50">
            <PackageCheck size={18} /> 입고 완료 ({paymentLabel(payment)})
          </button>
        </>
      )}

      {searchKey !== null && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-2 p-3 border-b border-border">
            <input autoFocus value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="코드·품명·속성 검색" aria-label="자재 검색" className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-primary" />
            <button type="button" onClick={() => setSearchKey(null)} className="text-sm text-primary px-2">닫기</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {found.length === 0 && <MobileEmpty text="맞는 자재가 없습니다." />}
            {found.map((m) => (
              <button key={m.id} type="button" onClick={() => { setLine(searchKey, { material: m }); setSearchKey(null); }} className="w-full text-left active:opacity-60">
                <MobileCard>
                  <CodeText code={m.code} small className="block truncate" />
                  <b className="block text-sm truncate">{m.name}</b>
                  <p className="text-xs text-text-muted truncate">{classLabel(m)}</p>
                </MobileCard>
              </button>
            ))}
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
