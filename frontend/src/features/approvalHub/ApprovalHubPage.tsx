import { ClipboardList, FileStack, FileText } from "lucide-react";
import { useState } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { DocumentsPage } from "../documents/DocumentsPage";
import { LeavesPage } from "../leaves/LeavesPage";
import { ProjectDocumentsPage } from "../projectDocuments/ProjectDocumentsPage";

type ApprovalTab = "documents" | "leaves" | "certificates";

const TABS: {
  key: ApprovalTab;
  title: string;
  description: string;
  icon: typeof FileStack;
  colorClass: string;
}[] = [
  {
    key: "documents",
    title: "문서관리",
    description: "견적서·거래명세서 작성 및 결재",
    icon: FileStack,
    colorClass: "text-tile-blue-fg",
  },
  {
    key: "leaves",
    title: "연차관리",
    description: "연차 신청·승인/반려 및 잔여 연차 확인",
    icon: ClipboardList,
    colorClass: "text-tile-purple-fg",
  },
  {
    key: "certificates",
    title: "증빙서류발급",
    description: "재직증명서·경력증명서 신청 및 발급",
    icon: FileText,
    colorClass: "text-tile-green-fg",
  },
];

export function ApprovalHubPage() {
  const [active, setActive] = useState<ApprovalTab>("documents");

  return (
    <MainLayout title="전자결재" description="문서관리·연차관리·증빙서류발급을 한곳에서 이용하세요.">
      <div className="border-b border-border flex items-end gap-1.5 pl-1 mb-5" role="tablist" aria-label="전자결재 메뉴">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.key)}
              title={tab.description}
              className={`flex items-center gap-2 text-sm px-5 py-2.5 rounded-t-xl border border-b-0 transition-colors ${
                isActive
                  ? "bg-surface border-border text-text font-bold -mb-px pb-3 shadow-[inset_0_2px_0_0_var(--color-primary)]"
                  : "bg-[#eceef2] border-border text-text-muted font-medium hover:text-text hover:bg-[#e4e7ee]"
              }`}
            >
              <Icon size={16} className={isActive ? "text-primary" : ""} />
              {tab.title}
            </button>
          );
        })}
      </div>

      {active === "documents" && <ProjectDocumentsPage embedded />}
      {active === "leaves" && <LeavesPage embedded />}
      {active === "certificates" && <DocumentsPage embedded />}
    </MainLayout>
  );
}
