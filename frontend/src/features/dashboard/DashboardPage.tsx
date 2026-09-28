import { CalendarPlus, Check, ChevronRight, ClipboardCheck, Megaphone, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { QuickActionCard } from "../../components/ui/QuickActionCard";
import { apiGet, apiPut } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "../notices/types";
import { AttendanceSection } from "../attendance/AttendanceSection";
import type { LeaveRecord } from "../leaves/types";
import type { Project } from "../projects/types";
import { ProjectOverviewCard } from "../projects/ProjectOverviewCard";
import { PROJECT_DOC_TYPE_LABELS, type ProjectDocument } from "../projectDocuments/types";
import { DOC_TYPE_LABELS, type DocumentRecord } from "../documents/types";

interface HealthResponse {
  status: string;
  app: string;
}

type ApprovalKind = "leave" | "document" | "project_document";

interface ApprovalItem {
  kind: ApprovalKind;
  id: number;
  label: string;
  personName: string;
  summary: string;
}

const APPROVAL_ENDPOINTS: Record<ApprovalKind, string> = {
  leave: "/api/leaves",
  document: "/api/documents",
  project_document: "/api/project-documents",
};

function toApprovalItems(
  leaves: LeaveRecord[],
  documents: DocumentRecord[],
  projectDocuments: ProjectDocument[]
): ApprovalItem[] {
  return [
    ...leaves.map((l) => ({
      kind: "leave" as const,
      id: l.id,
      label: "연차",
      personName: l.user_name,
      summary: `${l.start_date} ~ ${l.end_date} (${l.days}일)`,
    })),
    ...documents.map((d) => ({
      kind: "document" as const,
      id: d.id,
      label: DOC_TYPE_LABELS[d.doc_type],
      personName: d.user_name,
      summary: d.purpose ?? "용도 미기재",
    })),
    ...projectDocuments.map((p) => ({
      kind: "project_document" as const,
      id: p.id,
      label: PROJECT_DOC_TYPE_LABELS[p.doc_type],
      personName: p.project_name,
      summary: `${p.client_name} · ${p.issue_date}`,
    })),
  ];
}

export function DashboardPage() {
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [recentNotices, setRecentNotices] = useState<Notice[] | null>(null);
  const [pendingEstimateCount, setPendingEstimateCount] = useState<number | null>(null);
  const [stageBoardProjects, setStageBoardProjects] = useState<Project[] | null>(null);
  const [approvalInbox, setApprovalInbox] = useState<ApprovalItem[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function loadApprovalInbox() {
    logDebug("Dashboard", "내 결재함 조회 시작");
    Promise.all([
      apiGet<LeaveRecord[]>("/api/leaves?status=pending&approver_mine=true").catch((err) => {
        logError("Dashboard", "연차 결재함 조회 실패", err);
        return [];
      }),
      apiGet<DocumentRecord[]>("/api/documents?status=pending&approver_mine=true").catch((err) => {
        logError("Dashboard", "증명서 결재함 조회 실패", err);
        return [];
      }),
      apiGet<ProjectDocument[]>("/api/project-documents?status=pending&approver_mine=true").catch((err) => {
        logError("Dashboard", "문서관리 결재함 조회 실패", err);
        return [];
      }),
    ]).then(([leaves, documents, projectDocuments]) => {
      setApprovalInbox(toApprovalItems(leaves, documents, projectDocuments));
    });
  }

  async function handleApprovalDecision(item: ApprovalItem, decision: "approve" | "reject") {
    const key = `${item.kind}-${item.id}`;
    let reason: string | null = null;
    if (decision === "reject") {
      reason = window.prompt("반려 사유를 입력해주세요.");
      if (!reason || !reason.trim()) return;
    }
    setBusyKey(key);
    try {
      await apiPut(
        `${APPROVAL_ENDPOINTS[item.kind]}/${item.id}/${decision}`,
        decision === "reject" ? { reason: reason!.trim() } : undefined
      );
      loadApprovalInbox();
    } catch (err) {
      logError("Dashboard", `결재 ${decision} 처리 실패`, err);
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    logDebug("Dashboard", "백엔드 헬스체크 시작");
    apiGet<HealthResponse>("/api/health")
      .then(() => setBackendStatus("online"))
      .catch(() => setBackendStatus("offline"));

    logDebug("Dashboard", "최근 공지사항 조회 시작");
    apiGet<Notice[]>("/api/notices")
      .then((notices) => setRecentNotices(notices.slice(0, 5)))
      .catch((err) => {
        logError("Dashboard", "최근 공지사항 조회 실패", err);
        setRecentNotices([]);
      });

    logDebug("Dashboard", "안 읽은 업무 알림 조회 시작");
    apiGet<{ count: number }>("/api/notifications/unread-count")
      .then((res) => setUnreadNotificationCount(res.count))
      .catch((err) => logError("Dashboard", "안 읽은 업무 알림 조회 실패", err));

    logDebug("Dashboard", "프로젝트 현황 조회 시작");
    apiGet<Project[]>("/api/projects?status=estimate")
      .then((projects) => setPendingEstimateCount(projects.length))
      .catch((err) => logError("Dashboard", "미결 견적 조회 실패", err));

    logDebug("Dashboard", "프로젝트 진행 현황(단계별 보드) 조회 시작");
    apiGet<Project[]>("/api/projects")
      .then(setStageBoardProjects)
      .catch((err) => logError("Dashboard", "프로젝트 진행 현황 조회 실패", err));

    loadApprovalInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MainLayout
      title="대시보드"
      description="오늘의 업무 현황을 한눈에 확인하세요."
      actions={
        <span
          className={`text-xs px-3 py-1.5 rounded-full border ${
            backendStatus === "online"
              ? "border-success/30 text-success bg-tile-green"
              : backendStatus === "offline"
                ? "border-danger/30 text-danger bg-red-50"
                : "border-border text-text-muted bg-surface"
          }`}
        >
          {backendStatus === "online" && "● 백엔드 연결됨"}
          {backendStatus === "offline" && "● 백엔드 연결 안됨"}
          {backendStatus === "checking" && "● 연결 확인 중..."}
        </span>
      }
    >
      <section className="grid grid-cols-[1.7fr_1fr] gap-6 mb-8 items-start">
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-sm font-medium text-text-muted mb-3">빠른 실행</h2>
            <div className="grid grid-cols-2 gap-4">
              <QuickActionCard
                to="/schedule"
                title="일정 등록"
                description="새 일정을 빠르게 추가"
                icon={CalendarPlus}
                tile="blue"
                compact
              />
              <QuickActionCard
                to="#attendance"
                title="출퇴근 기록"
                description="오늘의 출퇴근을 기록"
                icon={Timer}
                tile="green"
                compact
              />
              <QuickActionCard
                to="/leaves"
                title="연차 신청"
                description="연차를 신청하고 확인"
                icon={ClipboardCheck}
                tile="purple"
                compact
              />
              <QuickActionCard
                to="/notices"
                title="공지사항 작성"
                description="전 직원에게 공지"
                icon={Megaphone}
                tile="orange"
                compact
              />
            </div>
          </div>

          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">프로젝트 진행 현황</h2>
                <p className="text-sm text-text-muted mt-0.5">평균 진행률과 주목할 프로젝트를 확인합니다.</p>
              </div>
              <Link
                to="/projects"
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 shrink-0"
              >
                전체 보기
                <ChevronRight size={14} />
              </Link>
            </div>
            {stageBoardProjects === null ? (
              <p className="text-sm text-text-muted">불러오는 중...</p>
            ) : (
              <ProjectOverviewCard projects={stageBoardProjects} />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-8">
          {approvalInbox.length > 0 && (
            <div className="bg-surface border border-tile-blue-fg/30 rounded-2xl p-4">
              <h2 className="text-xs font-semibold mb-2.5">결재 대기함 ({approvalInbox.length}건)</h2>
              <div className="space-y-1.5">
                {approvalInbox.map((item) => {
                  const key = `${item.kind}-${item.id}`;
                  return (
                    <div key={key} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs font-medium">
                          {item.label} · {item.personName}
                        </p>
                        <p className="text-[11px] text-text-muted mt-0.5">{item.summary}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleApprovalDecision(item, "approve")}
                          disabled={busyKey === key}
                          className="flex items-center gap-1 text-[11px] text-success border border-success/30 rounded-lg px-2 py-1 hover:bg-tile-green disabled:opacity-50"
                        >
                          <Check size={12} />
                          승인
                        </button>
                        <button
                          onClick={() => handleApprovalDecision(item, "reject")}
                          disabled={busyKey === key}
                          className="flex items-center gap-1 text-[11px] text-danger border border-danger/30 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X size={12} />
                          반려
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-surface border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs font-semibold">공지사항</h2>
              {recentNotices !== null && recentNotices.length > 0 && (
                <span className="font-medium bg-danger/10 text-danger px-2 py-0.5 rounded-full text-[11px]">
                  {recentNotices.length}건
                </span>
              )}
            </div>
            {recentNotices === null && <p className="text-xs text-text-muted">불러오는 중...</p>}
            {recentNotices !== null && recentNotices.length === 0 && (
              <p className="text-xs text-text-muted">등록된 공지사항이 없습니다.</p>
            )}
            {recentNotices !== null && recentNotices.length > 0 && (
              <ul>
                {recentNotices.slice(0, 3).map((notice, idx) => (
                  <li key={notice.id} className={idx < Math.min(recentNotices.length, 3) - 1 ? "border-b border-border" : ""}>
                    <Link to={`/notices/${notice.id}`} className="block py-1.5 hover:text-primary transition-colors">
                      <p className="text-xs font-medium truncate">{notice.title}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{formatDate(notice.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-surface border border-border rounded-2xl p-4">
            <h2 className="text-xs font-semibold mb-2.5">빠른 통계</h2>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link
                  to="/projects"
                  className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 hover:bg-border/40 transition-colors"
                >
                  <span>미결 견적</span>
                  <span className="font-medium bg-danger/10 text-danger px-2 py-0.5 rounded-full text-[11px]">
                    {pendingEstimateCount ?? "-"}
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  to="/approval"
                  className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 hover:bg-border/40 transition-colors"
                >
                  <span>결재 대기</span>
                  <span className="font-medium bg-danger/10 text-danger px-2 py-0.5 rounded-full text-[11px]">
                    {approvalInbox.length}
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  to="/notices"
                  className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 hover:bg-border/40 transition-colors"
                >
                  <span>업무 알림</span>
                  <span className="font-medium bg-danger/10 text-danger px-2 py-0.5 rounded-full text-[11px]">
                    {unreadNotificationCount ?? "-"}
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <AttendanceSection />
    </MainLayout>
  );
}
