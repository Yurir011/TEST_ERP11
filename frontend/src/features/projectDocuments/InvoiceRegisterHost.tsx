import { Suspense, lazy, useEffect, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { hasMenuPermission } from "../../lib/auth";
import { registerInvoiceOffer, type InvoiceOffer } from "../../lib/invoiceOffer";
import { logDebug } from "../../lib/logger";
// 작성 화면은 [등록하기]를 처음 누를 때만 내려받는다
const ProjectDocumentFormPage = lazy(async () => ({ default: (await import("./ProjectDocumentFormPage")).ProjectDocumentFormPage }));

/**
 * 세금계산서 파일을 올린 뒤 나오는 알림("세금계산서 목록에도 등록할까요?")과 등록 팝업 (App 에서 한 번만 둔다).
 * [등록하기]를 누르면 새 세금계산서 작성 화면이 팝업으로 열리고, 올린 사진을 인식해 입력란이 미리 채워진다.
 * 세금계산서 작성 권한이 없는 계정에는 알림을 띄우지 않는다.
 */
export function InvoiceRegisterHost() {
  const { user } = useAuth();
  const [offer, setOffer] = useState<InvoiceOffer | null>(null);
  const [open, setOpen] = useState(false);
  const canRegister = hasMenuPermission(user, "tax_invoice");

  useEffect(() => {
    registerInvoiceOffer(canRegister ? (o) => { setOffer(o); setOpen(false); } : null);
    return () => registerInvoiceOffer(null);
  }, [canRegister]);

  if (!offer) return null;
  const close = () => {
    setOffer(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <div role="status" className="fixed bottom-4 right-4 z-[55] w-80 rounded-xl border border-border bg-surface p-4 shadow-xl">
        <p className="text-sm font-semibold">세금계산서 파일을 올렸습니다</p>
        <p className="mt-1 text-xs text-text-muted">세금계산서 목록에도 등록할까요? 사진에서 내용을 읽어 미리 채워 드립니다.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg">
            나중에
          </button>
          <button
            type="button"
            onClick={() => {
              logDebug("InvoiceRegister", "등록 팝업 열기");
              setOpen(true);
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
          >
            등록하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <ProjectDocumentFormPage
        modal={{ files: offer.files, proposalId: offer.proposalId, transactionId: offer.transactionId, onDone: close, onClose: close }}
      />
    </Suspense>
  );
}

