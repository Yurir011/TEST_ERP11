import { useState } from "react";

export const POPBILL_CLIENT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "biz_reg_no", label: "사업자등록번호", placeholder: "000-00-00000" },
  { key: "ceo_name", label: "대표자명" },
  { key: "address", label: "사업장 주소" },
  { key: "biz_type", label: "업태" },
  { key: "biz_class", label: "종목" },
  { key: "email", label: "이메일", placeholder: "example@company.com" },
];

export type PopbillClientInfo = Record<string, string>;

/** 세금계산서 발행에 필요한 거래처 정보가 비어 있을 때 띄우는 입력 팝업. 입력값은 거래처관리에도 저장된다. */
export function PopbillRequiredInfoModal({
  clientName,
  missing,
  values,
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  clientName: string;
  missing: string[];
  values: PopbillClientInfo;
  isSubmitting: boolean;
  onConfirm: (info: PopbillClientInfo) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PopbillClientInfo>(values);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    for (const { key, label } of POPBILL_CLIENT_FIELDS) {
      const value = (form[key] ?? "").trim();
      if (!value) {
        setError(`${label}을(를) 입력해주세요.`);
        return;
      }
      if (key === "biz_reg_no" && value.replace(/\D/g, "").length !== 10) {
        setError("사업자등록번호는 숫자 10자리여야 합니다.");
        return;
      }
      if (key === "email" && !value.includes("@")) {
        setError("이메일 형식이 올바르지 않습니다.");
        return;
      }
    }
    onConfirm(form);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-sm font-semibold mb-1">거래처 정보 보완</h3>
        <p className="text-xs text-text-muted mb-4">
          '{clientName}'의 세금계산서 발행 필수 정보가 부족합니다. 입력하신 내용은 거래처관리에도 저장됩니다.
        </p>

        <div className="space-y-3 mb-4">
          {POPBILL_CLIENT_FIELDS.map(({ key, label, placeholder }) => {
            const isMissing = missing.includes(key);
            return (
              <div key={key}>
                <label className="block text-xs text-text-muted mb-1">
                  {label}
                  {isMissing && <span className="text-danger ml-1">필수 입력</span>}
                </label>
                <input
                  type="text"
                  value={form[key] ?? ""}
                  placeholder={placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`w-full rounded-lg border px-3 py-2 text-sm bg-surface ${isMissing ? "border-danger" : "border-border"}`}
                />
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-danger mb-3">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "발행 중..." : "저장 후 발행"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
