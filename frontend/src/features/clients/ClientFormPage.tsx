import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { logError } from "../../lib/logger";
import {
  EMPTY_CLIENT_CONTACT,
  EMPTY_CLIENT_FORM,
  type Client,
  type ClientContactFormValues,
  type ClientFormValues,
} from "./types";

const NUMBER_FIELDS = new Set<keyof ClientFormValues>(["receivable_amount", "payable_amount"]);

const FIELDS_TOP: { key: keyof ClientFormValues; label: string; required?: boolean }[] = [
  { key: "name", label: "상호", required: true },
  { key: "biz_reg_no", label: "사업자등록번호" },
  { key: "ceo_name", label: "대표자명" },
  { key: "business_type", label: "업종/업태" },
  { key: "phone", label: "전화번호(유선)" },
];

const FIELDS_BOTTOM: { key: keyof ClientFormValues; label: string; span2?: boolean }[] = [
  { key: "address", label: "주소", span2: true },
  { key: "receivable_amount", label: "미수금 (원)" },
  { key: "payable_amount", label: "미지급금 (원)" },
];

function toFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    biz_reg_no: client.biz_reg_no ?? "",
    ceo_name: client.ceo_name ?? "",
    business_type: client.business_type ?? "",
    phone: client.phone ?? "",
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

  useEffect(() => {
    if (!isEdit) return;
    apiGet<Client>(`/api/clients/${id}`)
      .then((client) => setValues(toFormValues(client)))
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
          <div className="grid grid-cols-2 gap-4">
            {FIELDS_TOP.map(({ key, label, required }) => (
              <div key={key}>
                <label className="block text-xs text-text-muted mb-1.5">{label}</label>
                <input
                  type="text"
                  required={required}
                  value={values[key] as string}
                  onChange={(e) => update(key, e.target.value)}
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
