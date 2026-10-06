import { useEffect, useState } from "react";
import { getToken } from "../../lib/auth";
import { logDebug, logError } from "../../lib/logger";
import type { ProjectDocument } from "./types";

/** 인증 헤더가 필요한 이미지 API를 blob URL로 받아 썸네일로 보여준다. 클릭하면 새 탭에서 원본을 연다. */
function AuthImage({ docId, image }: { docId: number; image: ProjectDocument["images"][number] }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const token = getToken();
    logDebug("TaxInvoiceImages", `사진 불러오기 시작: doc_id=${docId}, image_id=${image.id}`);
    fetch(`/api/project-documents/${docId}/images/${image.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((err) => {
        logError("TaxInvoiceImages", `사진 불러오기 실패: image_id=${image.id}`, err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId, image.id]);

  if (failed) return <div className="h-24 flex items-center justify-center text-[11px] text-text-muted bg-bg rounded-lg">불러오기 실패</div>;
  if (!src) return <div className="h-24 bg-bg rounded-lg animate-pulse" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={image.filename}>
      <img src={src} alt={image.filename} className="h-24 w-full object-cover rounded-lg border border-border" />
    </a>
  );
}

export function TaxInvoiceImages({ doc }: { doc: ProjectDocument }) {
  if (doc.images.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-xs text-text-muted mb-1.5">
        등록한 세금계산서 사진 ({doc.images.length})
        {doc.approval_no && <span> · 승인번호 {doc.approval_no}</span>}
        {doc.direction === "purchase" && <span> · 받은 세금계산서(매입)</span>}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {doc.images.map((image) => (
          <AuthImage key={image.id} docId={doc.id} image={image} />
        ))}
      </div>
    </div>
  );
}
