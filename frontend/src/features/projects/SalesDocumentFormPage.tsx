import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { ApiError, apiPost, downloadFile } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { logError } from "../../lib/logger";
import { SALES_DOC_LABELS, type SalesDocumentSet } from "./types";

interface ItemRow {
  name: string;
  spec: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ROW: ItemRow = { name: "", spec: "", quantity: "1", unitPrice: "0" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function SalesDocumentFormPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [issueDate, setIssueDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([{ ...EMPTY_ROW }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, key: keyof ItemRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function rowAmount(row: ItemRow) {
    return (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
  }

  const subtotal = rows.reduce((sum, row) => sum + rowAmount(row), 0);
  const vat = Math.round(subtotal * 0.1);
  const total = subtotal + vat;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const items = rows
      .filter((r) => r.name.trim() !== "")
      .map((r) => ({
        name: r.name.trim(),
        spec: r.spec.trim() || null,
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unitPrice) || 0,
      }));

    if (items.length === 0) {
      setError("품목을 1개 이상 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await apiPost<SalesDocumentSet>("/api/sales-documents", {
        project_id: Number(projectId),
        issue_date: issueDate,
        notes: notes || null,
        items,
      });
      await downloadFile(
        `/api/sales-documents/${created.estimate.id}/download`,
        `${SALES_DOC_LABELS.estimate}_${created.estimate.doc_no}.pdf`,
      );
      await downloadFile(
        `/api/sales-documents/${created.statement.id}/download`,
        `${SALES_DOC_LABELS.statement}_${created.statement.doc_no}.pdf`,
      );
      navigate(`/projects/${projectId}`, { replace: true });
    } catch (err) {
      logError("SalesDocumentForm", "생성 실패", err);
      setError(err instanceof ApiError ? err.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MainLayout
      title="견적서 · 거래명세서 작성"
      description="품목을 한 번 입력하면 견적서와 거래명세서가 같은 번호로 함께 생성됩니다."
    >
      <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl">
        <div className="bg-surface border border-border rounded-2xl p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">발행일</label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-2 pr-2 font-medium">품목</th>
                  <th className="py-2 pr-2 font-medium">규격</th>
                  <th className="py-2 pr-2 font-medium w-20">수량</th>
                  <th className="py-2 pr-2 font-medium w-32">단가</th>
                  <th className="py-2 pr-2 font-medium w-32">금액</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 pr-2">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(i, "name", e.target.value)}
                        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary bg-bg"
                        placeholder="품목명"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={row.spec}
                        onChange={(e) => updateRow(i, "spec", e.target.value)}
                        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary bg-bg"
                        placeholder="규격"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={row.quantity}
                        onChange={(e) => updateRow(i, "quantity", e.target.value)}
                        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary bg-bg"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={row.unitPrice}
                        onChange={(e) => updateRow(i, "unitPrice", e.target.value)}
                        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary bg-bg"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">{formatCurrency(rowAmount(row))}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="p-1.5 text-text-muted hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text mt-3 border border-border rounded-lg px-3 py-1.5"
          >
            <Plus size={14} />
            품목 추가
          </button>

          <div className="mt-5 flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">공급가액</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">부가세(10%)</span>
                <span>{formatCurrency(vat)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1.5 border-t border-border">
                <span>합계</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6">
          <label className="block text-xs text-text-muted mb-1.5">비고</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y"
            placeholder="납기, 결제조건 등 참고사항"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "생성 중..." : "견적서 · 거래명세서 생성 (PDF 2개 자동 다운로드)"}
        </button>
      </form>
    </MainLayout>
  );
}
