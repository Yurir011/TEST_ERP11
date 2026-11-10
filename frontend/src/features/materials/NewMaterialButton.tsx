import { Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

/** 자재 등록 버튼: 자재관리 화면 어디에서나 같은 모양으로 둔다. PC 는 글자 있는 파란 버튼, 모바일(mobile)은 + 아이콘. */
export function NewMaterialButton({ mobile = false }: { mobile?: boolean }) {
  const navigate = useNavigate();
  if (mobile) {
    return (
      <Link to="/m/materials/new" aria-label="자재 등록" className="w-10 h-10 flex items-center justify-center text-primary">
        <Plus size={22} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => navigate("/materials/new")} className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2.5">
      <Plus size={15} /> 자재 등록
    </button>
  );
}
