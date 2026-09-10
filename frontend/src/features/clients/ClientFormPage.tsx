import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiGet, apiPost, apiPut } from "../../lib/api";
import { logError } from "../../lib/logger";
import { EMPTY_CLIENT_FORM, type Client, type ClientFormValues } from "./types";

const NUMBER_FIELDS = new Set<keyof ClientFormValues>(["receivable_amount", "payable_amount"]);

const FIELDS: { key: keyof ClientFormValues; label: string; required?: boolean; span2?: boolean }[] = [
  { key: "name", label: "상호", required: true },
  { key: "biz_reg_no", label: "사업자등록번호" },
  { key: "ceo_name", label: "대표자명" },
  { key: "business_type", label: "업종/업태" },
  { key: "phone", label: "전화번호(유선)" },
  { key: "contact_name", label: "담당자" },
  { key: "contact_phone", label: "담당자 연락처" },
  { key: "contact_email", label: "담당자 이메일" },
  { key: "bank_name", label: "은행" },
  { key: "bank_account", label: "계좌번호" },
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
    contact_name: client.contact_name ?? "",
    contact_phone: client.contact_phone ?? "",
    contact_email: client.contact_email ?? "",
    bank_name: client.bank_name ?? "",
    bank_account: client.bank_account ?? "",
    address: client.address ?? "",
    receivable_amount: String(client.receivable_amount),
    payable_amount: String(client.payable_amount),
    memo: client.memo ?? "",
  };
}

function toPayload(values: ClientFormValues) {
  const entries = Object.entries(values).map(([k, v]) => {
    const key = k as keyof ClientFormValues;
    if (NUMBER_FIELDS.has(key)) {
      return [k, Number(v) || 0];
    }
    return [k, v.trim() === "" ? null : v.trim()];
  });
  return Object.fromEntries(entries);
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
            {FIELDS.map(({ key, label, required, span2 }) => (
              <div key={key} className={span2 ? "col-span-2" : ""}>
                <label className="block text-xs text-text-muted mb-1.5">{label}</label>
                <input
                  type={NUMBER_FIELDS.has(key) ? "number" : "text"}
                  required={required}
                  value={values[key]}
                  onChange={(e) => update(key, e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs text-text-muted mb-1.5">메모</label>
              <textarea
                rows={3}
                value={values.memo}
                onChange={(e) => update("memo", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
              />
            </div>
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
