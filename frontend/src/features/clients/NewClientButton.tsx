import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

export function NewClientButton() {
  return (
    <Link
      to="/clients/new"
      className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
    >
      <Plus size={16} />
      새 거래처 등록
    </Link>
  );
}
