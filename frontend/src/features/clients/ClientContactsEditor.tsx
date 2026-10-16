import { Plus, Trash2 } from "lucide-react";
import type { ClientContactFormValues } from "./types";

interface ClientContactsEditorProps {
  contacts: ClientContactFormValues[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, key: keyof ClientContactFormValues, value: string) => void;
}

/** 거래처 등록/수정 화면의 담당자 입력 목록 */
export function ClientContactsEditor({ contacts, onAdd, onRemove, onUpdate }: ClientContactsEditorProps) {
  return (
    <div className="mt-5 pt-5 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs text-text-muted">담당자</label>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-xs text-primary hover:opacity-80"
        >
          <Plus size={14} />
          담당자 추가
        </button>
      </div>

      {contacts.length === 0 && (
        <p className="text-xs text-text-muted">등록된 담당자가 없습니다. "담당자 추가"를 눌러 등록하세요.</p>
      )}

      <div className="space-y-3">
        {contacts.map((contact, index) => (
          <div key={index} className="bg-bg rounded-xl p-3 grid grid-cols-2 gap-2 relative">
            <button
              type="button"
              onClick={() => onRemove(index)}
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
                  onChange={(e) => onUpdate(index, "name", e.target.value)}
                  placeholder="이름"
                  className="w-1/2 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                />
                <input
                  value={contact.title}
                  onChange={(e) => onUpdate(index, "title", e.target.value)}
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
                  onChange={(e) => onUpdate(index, "landline_phone", e.target.value)}
                  placeholder="유선전화"
                  className="w-1/2 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                />
                <input
                  value={contact.mobile_phone}
                  onChange={(e) => onUpdate(index, "mobile_phone", e.target.value)}
                  placeholder="휴대폰"
                  className="w-1/2 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-text-muted mb-1">이메일</label>
              <input
                value={contact.email}
                onChange={(e) => onUpdate(index, "email", e.target.value)}
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-text-muted mb-1">메모</label>
              <textarea
                rows={2}
                value={contact.memo}
                onChange={(e) => onUpdate(index, "memo", e.target.value)}
                placeholder="이 담당자에 대한 메모"
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-primary bg-surface resize-y"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
