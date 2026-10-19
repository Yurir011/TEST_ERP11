import { Mail, X } from "lucide-react";
import type { NewMailItem } from "../../lib/desktop";
import { senderLabel } from "./useNewMailNotices";

interface Props {
  items: NewMailItem[];
  onOpen: (id: number) => void;
  onDismiss: (id: number) => void;
  onClear: () => void;
}

/** ERP 사이드바의 [메일] 아래에 나오는 새 메일 알림: 누르면 메일 창에서 그 메일이 열린다 */
export function NewMailNotices({ items, onOpen, onDismiss, onClear }: Props) {
  if (items.length === 0) return null;
  return (
    <section aria-label="새 메일 알림" className="mx-1 mt-1 mb-2 rounded-lg border border-primary/30 bg-tile-blue p-2 space-y-1">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
          <Mail size={12} aria-hidden="true" /> 새 메일
        </span>
        {items.length > 1 && (
          <button type="button" onClick={onClear} className="text-[11px] text-text-muted hover:text-text">
            모두 지우기
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-1 rounded-md bg-surface/80 hover:bg-surface">
            <button type="button" onClick={() => onOpen(n.id)} className="min-w-0 flex-1 text-left px-2 py-1.5" title={`${n.from}\n${n.subject}`}>
              <span className="block text-xs font-semibold truncate">{senderLabel(n.from)}</span>
              <span className="block text-[11px] text-text-muted truncate">{n.subject || "(제목 없음)"}</span>
            </button>
            <button type="button" onClick={() => onDismiss(n.id)} aria-label={`${senderLabel(n.from)} 알림 닫기`} className="p-1.5 text-text-muted hover:text-text shrink-0">
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
