import { ImagePlus, ScanText, X } from "lucide-react";
import type { ChangeEvent } from "react";
import type { TaxInvoiceOcrResult } from "./types";

interface TaxInvoicePhotoSectionProps {
  images: File[];
  isScanning: boolean;
  scanSummary: TaxInvoiceOcrResult | null;
  onFilesSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}

/** 세금계산서 작성 화면의 "사진 등록(선택)" 영역: 사진 목록과 첫 사진의 인식 결과 요약 */
export function TaxInvoicePhotoSection({ images, isScanning, scanSummary, onFilesSelect, onRemove }: TaxInvoicePhotoSectionProps) {
  return (
    <div className="border border-dashed border-border rounded-xl px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <ScanText size={14} />
          세금계산서 사진 등록 (선택)
        </span>
        <label className="flex items-center gap-1 text-xs text-primary hover:opacity-80 cursor-pointer">
          <ImagePlus size={14} />
          사진 선택
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={onFilesSelect} className="hidden" />
        </label>
      </div>
      <p className="text-[11px] text-text-muted mt-1">
        홈택스에서 받은 세금계산서 이미지(jpg, png, webp)를 올리면 첫 번째 사진에서 작성일자·거래처·품목·금액이 자동 입력되고,
        내용은 청구 / 금액은 미지급으로 처리됩니다. 올린 사진은 문서와 함께 저장됩니다.
      </p>
      {isScanning && <p className="text-xs text-primary mt-2">사진에서 내용을 인식하는 중...</p>}
      {images.length > 0 && (
        <ul className="mt-2 space-y-1">
          {images.map((f, idx) => (
            <li key={`${f.name}-${idx}`} className="flex items-center justify-between text-xs bg-bg rounded-lg px-2.5 py-1.5">
              <span className="truncate">
                {f.name}
                {idx === 0 && <span className="text-text-muted"> (자동 입력 기준)</span>}
              </span>
              <button type="button" onClick={() => onRemove(idx)} className="text-text-muted hover:text-danger">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {scanSummary && (
        <div className="mt-2 text-xs bg-tile-green text-tile-green-fg rounded-lg px-3 py-2 space-y-0.5">
          <p>
            {scanSummary.direction === "purchase"
              ? "받은 세금계산서(매입)로 인식했습니다."
              : scanSummary.direction === "sales"
                ? "발행한 세금계산서(매출)로 인식했습니다."
                : "매입/매출을 판별하지 못했습니다."}
            {scanSummary.approval_no && <span> · 승인번호 {scanSummary.approval_no}</span>}
          </p>
          <p className="opacity-80">
            공급자 {scanSummary.supplier.name ?? "-"} ({scanSummary.supplier.reg_no ?? "-"}) → 공급받는자{" "}
            {scanSummary.recipient.name ?? "-"} ({scanSummary.recipient.reg_no ?? "-"})
          </p>
          {scanSummary.total_amount !== null && (
            <p className="opacity-80">합계금액 {scanSummary.total_amount.toLocaleString()}원</p>
          )}
          {scanSummary.warnings.map((w) => (
            <p key={w} className="text-danger">
              ⚠ {w}
            </p>
          ))}
          <p className="opacity-80">자동 입력된 내용이 사진과 맞는지 아래 입력란에서 확인해주세요.</p>
        </div>
      )}
    </div>
  );
}
