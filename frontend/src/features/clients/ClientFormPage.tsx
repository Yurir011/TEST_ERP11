import { Eye, FileScan, Paperclip, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, apiPost, apiPut, apiUpload, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import type { BusinessRegOcrResult } from "./types";
import {
  EMPTY_CLIENT_CONTACT,
  EMPTY_CLIENT_FORM,
  type Client,
  type ClientContactFormValues,
  type ClientFormValues,
} from "./types";

const NUMBER_FIELDS = new Set<keyof ClientFormValues>(["receivable_amount", "payable_amount"]);

// 사업자등록번호는 어디든 3자리-2자리-5자리 형식이므로, 숫자만 남긴 뒤 하이픈을 자동으로 붙여준다.
function formatBizRegNo(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

const FIELDS_TOP: { key: keyof ClientFormValues; label: string; required?: boolean }[] = [
  { key: "name", label: "상호", required: true },
  { key: "biz_reg_no", label: "사업자등록번호" },
  { key: "ceo_name", label: "대표자명" },
  { key: "biz_type", label: "업태" },
  { key: "biz_class", label: "종목" },
  { key: "phone", label: "전화번호(유선)" },
  { key: "email", label: "이메일" },
];

const FIELDS_BOTTOM: { key: keyof ClientFormValues; label: string; span2?: boolean }[] = [
  { key: "address", label: "주소", span2: true },
  { key: "receivable_amount", label: "미수금 (원)" },
  { key: "payable_amount", label: "미지급금 (원)" },
];

function toFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    biz_reg_no: formatBizRegNo(client.biz_reg_no ?? ""),
    ceo_name: client.ceo_name ?? "",
    biz_type: client.biz_type ?? "",
    biz_class: client.biz_class ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    bank_name: client.bank_name ?? "",
    bank_account: client.bank_account ?? "",
    address: client.address ?? "",
    receivable_amount: String(client.receivable_amount),
    payable_amount: String(client.payable_amount),
    memo: client.memo ?? "",
    contacts: client.contacts.map((c) => ({
      name: c.name,
      title: c.title ?? "",
      landline_phone: c.landline_phone ?? "",
      mobile_phone: c.mobile_phone ?? "",
      email: c.email ?? "",
      memo: c.memo ?? "",
    })),
  };
}

function toPayload(values: ClientFormValues) {
  const entries = Object.entries(values)
    .filter(([k]) => k !== "contacts")
    .map(([k, v]) => {
      const key = k as keyof ClientFormValues;
      if (NUMBER_FIELDS.has(key)) {
        return [k, Number(v) || 0];
      }
      return [k, (v as string).trim() === "" ? null : (v as string).trim()];
    });

  const contacts = values.contacts
    .filter((c) => c.name.trim() !== "")
    .map((c) => ({
      name: c.name.trim(),
      title: c.title.trim() === "" ? null : c.title.trim(),
      landline_phone: c.landline_phone.trim() === "" ? null : c.landline_phone.trim(),
      mobile_phone: c.mobile_phone.trim() === "" ? null : c.mobile_phone.trim(),
      email: c.email.trim() === "" ? null : c.email.trim(),
      memo: c.memo.trim() === "" ? null : c.memo.trim(),
    }));

  return { ...Object.fromEntries(entries), contacts };
}

export function ClientFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [values, setValues] = useState<ClientFormValues>(EMPTY_CLIENT_FORM);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrFilledCount, setOcrFilledCount] = useState<number | null>(null);
  const [ocrRawText, setOcrRawText] = useState<string | null>(null);
  const [showOcrRawText, setShowOcrRawText] = useState(false);
  const [stagedBizRegFile, setStagedBizRegFile] = useState<File | null>(null);

  const bizRegInputRef = useRef<HTMLInputElement>(null);
  const [hasBizRegImage, setHasBizRegImage] = useState(false);
  const [isBizRegUploading, setIsBizRegUploading] = useState(false);
  const [bizRegError, setBizRegError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    apiGet<Client>(`/api/clients/${id}`)
      .then((client) => {
        setValues(toFormValues(client));
        setHasBizRegImage(client.has_biz_reg_image);
      })
      .catch((err) => {
        logError("ClientForm", "조회 실패", err);
        setError("거래처를 불러오지 못했습니다.");
      })
      .finally(() => setIsLoading(false));
  }, [id, isEdit]);

  function update(key: keyof ClientFormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function addContact() {
    setValues((prev) => ({ ...prev, contacts: [...prev.contacts, { ...EMPTY_CLIENT_CONTACT }] }));
  }

  function removeContact(index: number) {
    setValues((prev) => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== index) }));
  }

  function updateContact(index: number, key: keyof ClientContactFormValues, value: string) {
    setValues((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, [key]: value } : c)),
    }));
  }

  async function handleOcrFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 발생하도록 초기화
    if (!file) return;

    setStagedBizRegFile(file); // 저장 시 이 파일을 사업자등록증 첨부로 함께 업로드한다
    setOcrError(null);
    setOcrFilledCount(null);
    setOcrRawText(null);
    setShowOcrRawText(false);
    setIsOcrLoading(true);
    try {
      logDebug("ClientForm", `사업자등록증 인식 시도: ${file.name}`);
      const result = await apiUpload<BusinessRegOcrResult>("/api/clients/ocr/business-registration", file);
      setOcrRawText(result.raw_text || null);
      const updates: [keyof ClientFormValues, string | null][] = [
        ["name", result.name],
        ["biz_reg_no", result.biz_reg_no ? formatBizRegNo(result.biz_reg_no) : null],
        ["ceo_name", result.ceo_name],
        ["address", result.address],
        ["biz_type", result.biz_type],
        ["biz_class", result.biz_class],
      ];
      const filled = updates.filter(([, v]) => v);
      setValues((prev) => {
        const next = { ...prev };
        for (const [key, v] of filled) {
          if (v) next[key] = v as ClientFormValues[typeof key];
        }
        return next;
      });
      setOcrFilledCount(filled.length);
      if (filled.length === 0) {
        setOcrError("이미지에서 항목을 인식하지 못했습니다. 항목을 직접 입력해주세요.");
      }
      logDebug("ClientForm", `사업자등록증 인식 완료: ${filled.length}개 항목 채움`);
    } catch (err) {
      logError("ClientForm", "사업자등록증 인식 실패", err);
      setOcrError(err instanceof ApiError ? err.message : "인식 중 오류가 발생했습니다.");
    } finally {
      setIsOcrLoading(false);
    }
  }

  async function handleBizRegFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;

    setBizRegError(null);
    setIsBizRegUploading(true);
    try {
      logDebug("ClientForm", `사업자등록증 첨부 업로드 시도: ${file.name}`);
      await apiUpload(`/api/clients/${id}/biz-reg-image`, file);
      setHasBizRegImage(true);
    } catch (err) {
      logError("ClientForm", "사업자등록증 첨부 업로드 실패", err);
      setBizRegError(err instanceof ApiError ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setIsBizRegUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const payload = toPayload(values);
      if (isEdit) {
        await apiPut(`/api/clients/${id}`, payload);
        navigate(`/clients/${id}`, { replace: true });
      } else {
        const created = await apiPost<Client>("/api/clients", payload);
        if (stagedBizRegFile) {
          try {
            await apiUpload(`/api/clients/${created.id}/biz-reg-image`, stagedBizRegFile);
          } catch (err) {
            logError("ClientForm", "사업자등록증 첨부 업로드 실패", err);
          }
        }
        navigate(`/clients/${created.id}`, { replace: true });
      }
    } catch (err) {
      logError("ClientForm", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout title={isEdit ? "거래처 수정" : "새 거래처 등록"}>
      {isLoading ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 max-w-2xl">
          {!isEdit && (
            <div className="mb-5 pb-5 border-b border-border">
              <label className="block text-xs text-text-muted mb-1.5">사업자등록증 (자동 입력 + 첨부)</label>
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleOcrFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => ocrInputRef.current?.click()}
                disabled={isOcrLoading}
                className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-60"
              >
                <FileScan size={14} />
                {isOcrLoading ? "인식 중..." : "사업자등록증 이미지 업로드"}
              </button>
              {stagedBizRegFile && (
                <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
                  <Paperclip size={12} />
                  {stagedBizRegFile.name} (저장 시 첨부파일로 함께 등록됩니다)
                </p>
              )}
              {ocrFilledCount !== null && ocrFilledCount > 0 && (
                <p className="text-xs text-success mt-1.5">
                  {ocrFilledCount}개 항목을 자동으로 채웠습니다. 저장 전 내용을 꼭 확인해주세요 (OCR 인식은 오류가 있을 수 있습니다).
                </p>
              )}
              {ocrError && <p className="text-xs text-danger mt-1.5">{ocrError}</p>}
              {ocrRawText && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowOcrRawText((v) => !v)}
                    className="text-xs text-primary hover:opacity-80"
                  >
                    {showOcrRawText ? "인식된 원문 숨기기" : "인식된 원문 보기 (일부 항목이 비었다면 확인해보세요)"}
                  </button>
                  {showOcrRawText && (
                    <pre className="mt-1.5 whitespace-pre-wrap break-words text-[11px] text-text-muted bg-bg rounded-lg p-3 max-h-48 overflow-y-auto">
                      {ocrRawText}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {isEdit && (
            <div className="mb-5 pb-5 border-b border-border">
              <label className="block text-xs text-text-muted mb-1.5">사업자등록증 첨부</label>
              <input
                ref={bizRegInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleBizRegFileSelect}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bizRegInputRef.current?.click()}
                  disabled={isBizRegUploading}
                  className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-60"
                >
                  <Paperclip size={14} />
                  {isBizRegUploading ? "업로드 중..." : hasBizRegImage ? "다시 첨부" : "파일 첨부"}
                </button>
                {hasBizRegImage && (
                  <button
                    type="button"
                    onClick={() => openFile(`/api/clients/${id}/biz-reg-image`)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80"
                  >
                    <Eye size={14} />
                    첨부 보기
                  </button>
                )}
              </div>
              {bizRegError && <p className="text-xs text-danger mt-1.5">{bizRegError}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {FIELDS_TOP.map(({ key, label, required }) => (
              <div key={key}>
                <label className="block text-xs text-text-muted mb-1.5">{label}</label>
                <input
                  type={key === "email" ? "email" : "text"}
                  required={required}
                  inputMode={key === "biz_reg_no" ? "numeric" : undefined}
                  placeholder={key === "biz_reg_no" ? "123-45-67890" : undefined}
                  maxLength={key === "biz_reg_no" ? 12 : undefined}
                  value={values[key] as string}
                  onChange={(e) => update(key, key === "biz_reg_no" ? formatBizRegNo(e.target.value) : e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                />
              </div>
            ))}

            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">은행</label>
                <input
                  value={values.bank_name}
                  onChange={(e) => update("bank_name", e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">계좌번호</label>
                <input
                  value={values.bank_account}
                  onChange={(e) => update("bank_account", e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                />
              </div>
            </div>

            {FIELDS_BOTTOM.map(({ key, label, span2 }) => (
              <div key={key} className={span2 ? "col-span-2" : ""}>
                <label className="block text-xs text-text-muted mb-1.5">{label}</label>
                <input
                  type={NUMBER_FIELDS.has(key) ? "number" : "text"}
                  value={values[key] as string}
                  onChange={(e) => update(key, e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs text-text-muted">담당자</label>
              <button
                type="button"
                onClick={addContact}
                className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
              >
                <Plus size={14} />
                담당자 추가
              </button>
            </div>

            {values.contacts.length === 0 && (
              <p className="text-xs text-text-muted">등록된 담당자가 없습니다. "담당자 추가"를 눌러 등록하세요.</p>
            )}

            <div className="space-y-3">
              {values.contacts.map((contact, index) => (
                <div key={index} className="bg-bg rounded-xl p-3 grid grid-cols-2 gap-2 relative">
                  <button
                    type="button"
                    onClick={() => removeContact(index)}
                    className="absolute top-2 right-2 text-text-muted hover:text-danger"
                    title="담당자 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div>
                    <label className="block text-[11px] text-text-muted mb-1">담당자/직책</label>
                    <div className="flex gap-1.5">
                      <input
                        value={contact.name}
                        onChange={(e) => updateContact(index, "name", e.target.value)}
                        placeholder="이름"
                        className="w-1/2 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                      />
                      <input
                        value={contact.title}
                        onChange={(e) => updateContact(index, "title", e.target.value)}
                        placeholder="직책"
                        className="w-1/2 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-text-muted mb-1">유선전화 / 휴대폰</label>
                    <div className="flex gap-1.5">
                      <input
                        value={contact.landline_phone}
                        onChange={(e) => updateContact(index, "landline_phone", e.target.value)}
                        placeholder="유선전화"
                        className="w-1/2 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                      />
                      <input
                        value={contact.mobile_phone}
                        onChange={(e) => updateContact(index, "mobile_phone", e.target.value)}
                        placeholder="휴대폰"
                        className="w-1/2 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-text-muted mb-1">이메일</label>
                    <input
                      value={contact.email}
                      onChange={(e) => updateContact(index, "email", e.target.value)}
                      className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-text-muted mb-1">메모</label>
                    <textarea
                      rows={2}
                      value={contact.memo}
                      onChange={(e) => updateContact(index, "memo", e.target.value)}
                      placeholder="이 담당자에 대한 메모"
                      className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface resize-y"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs text-text-muted mb-1.5">메모</label>
            <textarea
              rows={3}
              value={values.memo}
              onChange={(e) => update("memo", e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
            />
          </div>

          {error && <p className="text-xs text-danger mt-4">{error}</p>}

          <div className="flex items-center gap-2 mt-5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </MainLayout>
  );
}
