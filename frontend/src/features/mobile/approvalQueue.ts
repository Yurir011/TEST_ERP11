import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { DOC_TYPE_LABELS, type DocumentRecord } from "../documents/types";
import type { LeaveRecord } from "../leaves/types";
import { PROJECT_DOC_TYPE_LABELS, type ProjectDocument } from "../projectDocuments/types";
import type { Proposal } from "../proposals/types";

export type ApprovalKind = "leave" | "document" | "project" | "proposal";

/** 내가 결재해야 할 문서를 종류와 상관없이 같은 모양으로 다루기 위한 항목. */
export interface ApprovalItem {
  key: string;
  kind: ApprovalKind;
  id: number;
  kindLabel: string;
  title: string;
  subtitle: string;
  date: string;
  /** 승인/반려 API의 기본 경로 (예: /api/leaves/3) */
  basePath: string;
}

async function safeGet<T>(path: string): Promise<T[]> {
  try {
    return await apiGet<T[]>(path);
  } catch (err) {
    logError("MobileApproval", `조회 실패: ${path}`, err);
    return [];
  }
}

/** 내 결재함(결재 대기)을 4종류(연차/증빙서류/문서관리/품의서)에서 모아 최신순으로 돌려준다. */
export function useApprovalQueue() {
  const [items, setItems] = useState<ApprovalItem[] | null>(null);

  const reload = useCallback(() => {
    logDebug("MobileApproval", "내 결재함 조회 시작");
    Promise.all([
      safeGet<LeaveRecord>("/api/leaves?status=pending&approver_mine=true"),
      safeGet<DocumentRecord>("/api/documents?status=pending&approver_mine=true"),
      safeGet<ProjectDocument>("/api/project-documents?status=pending&approver_mine=true"),
      safeGet<Proposal>("/api/proposals?status=pending&approver_mine=true"),
    ]).then(([leaves, docs, projectDocs, proposals]) => {
      const list: ApprovalItem[] = [
        ...leaves.map<ApprovalItem>((l) => ({
          key: `leave-${l.id}`,
          kind: "leave",
          id: l.id,
          kindLabel: "연차",
          title: `${l.start_date} ~ ${l.end_date} (${l.days}일)`,
          subtitle: `${l.user_name} · ${l.reason}`,
          date: l.created_at,
          basePath: `/api/leaves/${l.id}`,
        })),
        ...docs.map<ApprovalItem>((d) => ({
          key: `document-${d.id}`,
          kind: "document",
          id: d.id,
          kindLabel: "증빙서류",
          title: DOC_TYPE_LABELS[d.doc_type],
          subtitle: `${d.user_name}${d.purpose ? ` · ${d.purpose}` : ""}`,
          date: d.issued_at,
          basePath: `/api/documents/${d.id}`,
        })),
        ...projectDocs.map<ApprovalItem>((d) => ({
          key: `project-${d.id}`,
          kind: "project",
          id: d.id,
          kindLabel: PROJECT_DOC_TYPE_LABELS[d.doc_type],
          title: d.project_name,
          subtitle: `${d.client_name}${d.doc_no ? ` · ${d.doc_no}` : ""}`,
          date: d.created_at,
          basePath: `/api/project-documents/${d.id}`,
        })),
        ...proposals.map<ApprovalItem>((p) => ({
          key: `proposal-${p.id}`,
          kind: "proposal",
          id: p.id,
          kindLabel: p.kind ? `품의서(${p.kind})` : "품의서",
          title: p.title,
          subtitle: `${p.creator_name} · ${p.doc_no}`,
          date: p.created_at,
          basePath: `/api/proposals/${p.id}`,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      logDebug("MobileApproval", `내 결재함 ${list.length}건`);
      setItems(list);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, reload };
}
