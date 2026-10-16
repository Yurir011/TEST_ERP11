import { Eye, FileScan, Landmark, Paperclip } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, apiPost, apiPut, apiUpload, openFile } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { NewClientButton } from "./NewClientButton";
import { ClientContactsEditor } from "./ClientContactsEditor";
import {
  FIELDS_BOTTOM,
  FIELDS_TOP,
  NUMBER_FIELDS,
  bizRegOcrUpdates,
  formatBizRegNo,
  normalizeClientName,
  toFormValues,
  toPayload,
} from "./clientForm";
import type { BankbookOcrResult, BusinessRegOcrResult } from "./types";
import {
  EMPTY_CLIENT_CONTACT,
  EMPTY_CLIENT_FORM,
  type Client,
  type ClientContactFormValues,
  type ClientFormValues,
} from "./types";
import { NumberInput } from "../../components/ui/NumberInput";
import { useDialog } from "../../components/ui/dialog/useDialog";

export function ClientFormPage() {
  const { confirm } = useDialog();
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
  // 사업자등록증이 2장인 거래처를 위한 2쪽 첨부 (OCR 없이 첨부만 한다)
  const bizReg2InputRef = useRef<HTMLInputElement>(null);
  const [stagedBizReg2File, setStagedBizReg2File] = useState<File | null>(null);
  const [hasBizRegImage2, setHasBizRegImage2] = useState(false);
  const [isBizRegUploading, setIsBizRegUploading] = useState(false);
  const [bizRegError, setBizRegError] = useState<string | null>(null);

  // 통장사본: 이미지를 올리면 은행/계좌번호를 자동 입력하고 원본도 첨부한다 (신규 등록은 저장할 때 함께 업로드).
  const bankbookInputRef = useRef<HTMLInputElement>(null);
  const [isBankbookLoading, setIsBankbookLoading] = useState(false);
  const [bankbookError, setBankbookError] = useState<string | null>(null);
  const [bankbookMessage, setBankbookMessage] = useState<string | null>(null);
  const [stagedBankbookFile, setStagedBankbookFile] = useState<File | null>(null);
  const [hasBankbookImage, setHasBankbookImage] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    apiGet<Client>(`/api/clients/${id}`)
      .then((client) => {
        setValues(toFormValues(client));
        setHasBizRegImage(client.has_biz_reg_image);
        setHasBizRegImage2(client.has_biz_reg_image2);
        setHasBankbookImage(client.has_bankbook_image);
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
      const filled = bizRegOcrUpdates(result);
      setValues((prev) => {
        const next = { ...prev };
        for (const [key, v] of filled) {
          if (v) (next as Record<string, unknown>)[key] = v;
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

  async function handleBankbookSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBankbookError(null);
    setBankbookMessage(null);
    setIsBankbookLoading(true);
    try {
      logDebug("ClientForm", `통장사본 인식 시도: ${file.name}`);
      const result = await apiUpload<BankbookOcrResult>("/api/clients/ocr/bankbook", file);
      setValues((prev) => ({
        ...prev,
        bank_name: result.bank_name ?? prev.bank_name,
        bank_account: result.bank_account ?? prev.bank_account,
      }));
      const filled = [result.bank_name, result.bank_account].filter(Boolean).length;
      if (filled === 0) {
        setBankbookError("통장사본에서 은행/계좌번호를 인식하지 못했습니다. 직접 입력해주세요.");
      } else {
        const holderNote = result.holder ? ` (예금주: ${result.holder})` : "";
        setBankbookMessage(
          `${filled}개 항목을 자동으로 채웠습니다${holderNote}. 저장 전 계좌번호를 통장과 꼭 대조해주세요 (OCR 인식은 오류가 있을 수 있습니다).`
        );
      }
      // 수정 화면은 바로 첨부로 저장하고, 신규 등록은 거래처 저장 후 업로드한다.
      if (isEdit && id) {
        await apiUpload(`/api/clients/${id}/bankbook-image`, file);
        setHasBankbookImage(true);
      } else {
        setStagedBankbookFile(file);
      }
      logDebug("ClientForm", `통장사본 인식 완료: bank=${result.bank_name}, account=${result.bank_account}`);
    } catch (err) {
      logError("ClientForm", "통장사본 인식 실패", err);
      setBankbookError(err instanceof ApiError ? err.message : "인식 중 오류가 발생했습니다.");
    } finally {
      setIsBankbookLoading(false);
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

  async function handleBizReg2Select(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBizRegError(null);
    // 수정 화면은 바로 첨부로 저장하고, 신규 등록은 거래처 저장 후 업로드한다.
    if (!isEdit || !id) {
      logDebug("ClientForm", `사업자등록증 2쪽 대기: ${file.name}`);
      setStagedBizReg2File(file);
      return;
    }
    setIsBizRegUploading(true);
    try {
      logDebug("ClientForm", `사업자등록증 2쪽 업로드 시도: ${file.name}`);
      await apiUpload(`/api/clients/${id}/biz-reg-image2`, file);
      setHasBizRegImage2(true);
    } catch (err) {
      logError("ClientForm", "사업자등록증 2쪽 업로드 실패", err);
      setBizRegError(err instanceof ApiError ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setIsBizRegUploading(false);
    }
  }

  /** 같은 이름의 거래처가 이미 있으면 저장 전에 한 번 더 확인한다. 띄어쓰기/법인 형태(주식회사, (주))가 달라도 같은 이름으로 본다. */
  async function confirmDuplicateName(): Promise<boolean> {
    const target = normalizeClientName(values.name);
    if (!target) return true;
    try {
      const clients = await apiGet<Client[]>("/api/clients");
      const duplicates = clients.filter((c) => String(c.id) !== id && normalizeClientName(c.name) === target);
      if (duplicates.length === 0) return true;
      logDebug("ClientForm", `이름 중복 확인: name=${values.name}, duplicates=${duplicates.length}`);
      const list = duplicates.map((c) => `- ${c.name}${c.biz_reg_no ? ` (${c.biz_reg_no})` : ""}`).join("\n");
      return confirm(`이미 같은 이름의 거래처가 등록되어 있습니다.\n\n${list}\n\n그래도 ${isEdit ? "저장" : "등록"}하시겠습니까?`, { okLabel: isEdit ? "저장" : "등록" });
    } catch (err) {
      // 중복 조회에 실패해도 저장 자체는 막지 않는다.
      logError("ClientForm", "이름 중복 확인 실패", err);
      return true;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (!(await confirmDuplicateName())) {
        logDebug("ClientForm", "이름 중복 확인에서 취소됨");
        return;
      }
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
        if (stagedBizReg2File) {
          try {
            await apiUpload(`/api/clients/${created.id}/biz-reg-image2`, stagedBizReg2File);
          } catch (err) {
            logError("ClientForm", "사업자등록증 2쪽 업로드 실패", err);
          }
        }
        if (stagedBankbookFile) {
          try {
            await apiUpload(`/api/clients/${created.id}/bankbook-image`, stagedBankbookFile);
          } catch (err) {
            logError("ClientForm", "통장사본 첨부 업로드 실패", err);
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
    <MainLayout title={isEdit ? "거래처 수정" : "새 거래처 등록"} actions={isEdit ? <NewClientButton /> : undefined}>
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
              <input
                ref={bizReg2InputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleBizReg2Select}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => bizReg2InputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg mt-2"
              >
                <Paperclip size={14} />
                {stagedBizReg2File ? "2쪽 다시 첨부" : "2쪽 첨부 (2장짜리인 경우)"}
              </button>
              {stagedBizReg2File && (
                <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
                  <Paperclip size={12} />
                  {stagedBizReg2File.name} (저장 시 2쪽으로 함께 등록됩니다)
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
              <input
                ref={bizReg2InputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleBizReg2Select}
                className="hidden"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => bizReg2InputRef.current?.click()}
                  disabled={isBizRegUploading}
                  className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-60"
                >
                  <Paperclip size={14} />
                  {hasBizRegImage2 ? "2쪽 다시 첨부" : "2쪽 첨부 (2장짜리인 경우)"}
                </button>
                {hasBizRegImage2 && (
                  <button
                    type="button"
                    onClick={() => openFile(`/api/clients/${id}/biz-reg-image2`)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80"
                  >
                    <Eye size={14} />
                    2쪽 보기
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

            <div className="col-span-2">
              <label className="block text-xs text-text-muted mb-1.5">통장사본 (자동 입력 + 첨부)</label>
              <input
                ref={bankbookInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleBankbookSelect}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bankbookInputRef.current?.click()}
                  disabled={isBankbookLoading}
                  className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-2 hover:bg-bg disabled:opacity-60"
                >
                  <Landmark size={14} />
                  {isBankbookLoading ? "인식 중..." : hasBankbookImage || stagedBankbookFile ? "통장사본 다시 업로드" : "통장사본 이미지 업로드"}
                </button>
                {hasBankbookImage && isEdit && (
                  <button
                    type="button"
                    onClick={() => openFile(`/api/clients/${id}/bankbook-image`)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80"
                  >
                    <Eye size={14} />
                    첨부 보기
                  </button>
                )}
              </div>
              {stagedBankbookFile && (
                <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
                  <Paperclip size={12} />
                  {stagedBankbookFile.name} (저장 시 첨부파일로 함께 등록됩니다)
                </p>
              )}
              {bankbookMessage && <p className="text-xs text-success mt-1.5">{bankbookMessage}</p>}
              {bankbookError && <p className="text-xs text-danger mt-1.5">{bankbookError}</p>}
            </div>

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
                {NUMBER_FIELDS.has(key) ? (
                  <NumberInput value={values[key] as string} onChange={(v) => update(key, v)} className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg" />
                ) : (
                  <input
                    type="text"
                    value={values[key] as string}
                    onChange={(e) => update(key, e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                  />
                )}
              </div>
            ))}
          </div>

          <ClientContactsEditor contacts={values.contacts} onAdd={addContact} onRemove={removeContact} onUpdate={updateContact} />

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
