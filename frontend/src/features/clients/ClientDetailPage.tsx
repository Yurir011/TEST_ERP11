import { ArrowLeft, Landmark, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { useAuth } from "../../context/AuthContext";
import { apiDelete, apiGet } from "../../lib/api";
import { formatCurrency, formatDate } from "../../lib/format";
import { logError } from "../../lib/logger";
import type { Client } from "./types";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="py-3 border-b border-border last:border-0">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm mt-1">{value || "-"}</p>
    </div>
  );
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBankInfo, setShowBankInfo] = useState(false);

  useEffect(() => {
    apiGet<Client>(`/api/clients/${id}`)
      .then(setClient)
      .catch((err) => {
        logError("ClientDetail", "조회 실패", err);
        setError("거래처를 찾을 수 없습니다.");
      });
  }, [id]);

  async function handleDelete() {
    if (!window.confirm("이 거래처를 삭제할까요?")) return;
    setIsDeleting(true);
    try {
      await apiDelete(`/api/clients/${id}`);
      navigate("/clients", { replace: true });
    } catch (err) {
      logError("ClientDetail", "삭제 실패", err);
      setError("삭제 중 오류가 발생했습니다.");
      setIsDeleting(false);
    }
  }

  return (
    <MainLayout title="거래처관리">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text mb-4">
        <ArrowLeft size={16} />
        목록으로
      </Link>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !client && <p className="text-sm text-text-muted">불러오는 중...</p>}

      {client && (
        <div className="bg-surface border border-border rounded-2xl p-6 max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{client.name}</h1>
              <p className="text-xs text-text-muted mt-1">최근 수정: {formatDate(client.updated_at)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to={`/clients/${client.id}/edit`}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5"
              >
                <Pencil size={14} />
                수정
              </Link>
              {user?.role === "admin" && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1 text-xs text-danger hover:opacity-80 border border-danger/30 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-5">
            <div className="bg-bg rounded-xl p-4">
              <p className="text-xs text-text-muted">미수금</p>
              <p className="text-lg font-semibold mt-1 text-danger">{formatCurrency(client.receivable_amount)}</p>
            </div>
            <div className="bg-bg rounded-xl p-4">
              <p className="text-xs text-text-muted">미지급금</p>
              <p className="text-lg font-semibold mt-1 text-primary">{formatCurrency(client.payable_amount)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBankInfo((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 mt-3"
          >
            <Landmark size={14} />
            {showBankInfo ? "계좌 정보 숨기기" : "계좌 정보 보기"}
          </button>

          {showBankInfo && (
            <div className="mt-1">
              <Field label="은행" value={client.bank_name} />
              <Field label="계좌번호" value={client.bank_account} />
            </div>
          )}

          <div className="mt-2">
            <Field label="사업자등록번호" value={client.biz_reg_no} />
            <Field label="대표자명" value={client.ceo_name} />
            <Field label="업종/업태" value={client.business_type} />
            <Field label="전화번호(유선)" value={client.phone} />
            <Field label="주소" value={client.address} />
            <Field label="메모" value={client.memo} />
          </div>

          <div className="mt-2 pt-3 border-t border-border">
            <p className="text-xs text-text-muted mb-2">담당자 {client.contacts.length > 0 && `(${client.contacts.length})`}</p>
            {client.contacts.length === 0 ? (
              <p className="text-sm text-text-muted py-2">등록된 담당자가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {client.contacts.map((c) => (
                  <div key={c.id} className="bg-bg rounded-xl p-3 text-sm">
                    <p className="font-medium">
                      {c.name}
                      {c.title && <span className="text-text-muted font-normal"> · {c.title}</span>}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {[
                        c.landline_phone && `유선 ${c.landline_phone}`,
                        c.mobile_phone && `휴대폰 ${c.mobile_phone}`,
                        c.email,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </p>
                    {c.memo && <p className="text-xs text-text-muted mt-1.5 whitespace-pre-wrap">{c.memo}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
