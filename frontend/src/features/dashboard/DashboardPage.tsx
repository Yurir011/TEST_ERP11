import {
  Banknote,
  Building2,
  CalendarPlus,
  Check,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  Megaphone,
  Timer,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { QuickActionCard } from "../../components/ui/QuickActionCard";
import { StatCard } from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import { apiGet, apiPut } from "../../lib/api";
import { formatCurrency, formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "../notices/types";
import type { LeaveBalance, LeaveRecord } from "../leaves/types";
import type { Client } from "../clients/types";
import type { Project } from "../projects/types";
import { ProjectOverviewCard } from "../projects/ProjectOverviewCard";
import type { PaymentReport } from "../payments/types";
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
  const { user } = useAuth();
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [recentNotices, setRecentNotices] = useState<Notice[] | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [inProgressCount, setInProgressCount] = useState<number | null>(null);
  const [pendingEstimateCount, setPendingEstimateCount] = useState<number | null>(null);
  const [stageBoardProjects, setStageBoardProjects] = useState<Project[] | null>(null);
  const [paymentReport, setPaymentReport] = useState<PaymentReport | null>(null);
  const [approvalInbox, setApprovalInbox] = useState<ApprovalItem[]>([]);
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

    logDebug("Dashboard", "잔여 연차 조회 시작");
    apiGet<LeaveBalance>("/api/leaves/balance")
      .then(setLeaveBalance)
      .catch((err) => logError("Dashboard", "잔여 연차 조회 실패", err));

    logDebug("Dashboard", "거래처 수 조회 시작");
    apiGet<Client[]>("/api/clients")
      .then((clients) => setClientCount(clients.length))
      .catch((err) => logError("Dashboard", "거래처 수 조회 실패", err));

    logDebug("Dashboard", "프로젝트 현황 조회 시작");
    apiGet<Project[]>("/api/projects?status=in_progress")
      .then((projects) => setInProgressCount(projects.length))
      .catch((err) => logError("Dashboard", "진행중 프로젝트 조회 실패", err));
    apiGet<Project[]>("/api/projects?status=estimate")
      .then((projects) => setPendingEstimateCount(projects.length))
      .catch((err) => logError("Dashboard", "미결 견적 조회 실패", err));

    logDebug("Dashboard", "프로젝트 진행 현황(단계별 보드) 조회 시작");
    apiGet<Project[]>("/api/projects")
      .then(setStageBoardProjects)
      .catch((err) => logError("Dashboard", "프로젝트 진행 현황 조회 실패", err));

    loadApprovalInbox();

    if (user?.role === "admin") {
      const now = new Date();
      logDebug("Dashboard", "이번달 입금액 조회 시작");
      apiGet<PaymentReport>(`/api/payments/report/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
        .then(setPaymentReport)
        .catch((err) => logError("Dashboard", "이번달 입금액 조회 실패", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

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
      <section className="mb-8">
        <h2 className="text-sm font-medium text-text-muted mb-3">빠른 실행</h2>
        <div className="grid grid-cols-4 gap-4">
          <QuickActionCard
            to="/schedule"
            title="일정 등록"
            description="새 일정을 빠르게 추가"
            icon={CalendarPlus}
            tile="blue"
          />
          <QuickActionCard
            to="/attendance"
            title="출퇴근 기록"
            description="오늘의 출퇴근을 기록"
            icon={Timer}
            tile="green"
          />
          <QuickActionCard
            to="/leaves"
            title="연차 신청"
            description="연차를 신청하고 확인"
            icon={ClipboardCheck}
            tile="purple"
          />
          <QuickActionCard
            to="/notices"
            title="공지사항 작성"
            description="전 직원에게 공지"
            icon={Megaphone}
            tile="orange"
          />
        </div>
      </section>

      {approvalInbox.length > 0 && (
        <section className="bg-surface border border-tile-blue-fg/30 rounded-2xl p-5 mb-8">
          <h2 className="text-sm font-semibold mb-3">결재 대기함 ({approvalInbox.length}건)</h2>
          <div className="space-y-2">
            {approvalInbox.map((item) => {
              const key = `${item.kind}-${item.id}`;
              return (
                <div key={key} className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {item.label} · {item.personName}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{item.summary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApprovalDecision(item, "approve")}
                      disabled={busyKey === key}
                      className="flex items-center gap-1 text-xs text-success border border-success/30 rounded-lg px-3 py-1.5 hover:bg-tile-green disabled:opacity-50"
                    >
                      <Check size={14} />
                      승인
                    </button>
                    <button
                      onClick={() => handleApprovalDecision(item, "reject")}
                      disabled={busyKey === key}
                      className="flex items-center gap-1 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
                    >
                      <X size={14} />
                      반려
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="이번달 정상 출근"
          value="18일"
          change="전월 대비 +2일"
          trend="up"
          icon={Timer}
          to="/attendance"
        />
        <StatCard
          label="잔여 연차"
          value={leaveBalance ? `${leaveBalance.remaining}일` : "-"}
          change={leaveBalance ? `총 ${leaveBalance.granted}일 중` : undefined}
          icon={Users}
          to="/leaves"
        />
        <StatCard
          label="진행중 프로젝트"
          value={inProgressCount === null ? "-" : `${inProgressCount}건`}
          icon={FolderKanban}
          to="/projects"
        />
        <StatCard
          label="거래처 수"
          value={clientCount === null ? "-" : `${clientCount}곳`}
          icon={Building2}
          to="/clients"
        />
      </section>

      <section className="mb-8">
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
      </section>

      <section className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">최근 활동</h2>
          {recentNotices === null && <p className="text-sm text-text-muted">불러오는 중...</p>}
          {recentNotices !== null && recentNotices.length === 0 && (
            <p className="text-sm text-text-muted">등록된 공지사항이 없습니다.</p>
          )}
          {recentNotices !== null && recentNotices.length > 0 && (
            <ul className="space-y-3">
              {recentNotices.map((notice) => (
                <li key={notice.id}>
                  <Link
                    to={`/notices/${notice.id}`}
                    className="flex items-center justify-between bg-bg rounded-xl px-4 py-3 text-sm hover:bg-border/40 transition-colors"
                  >
                    <span>공지사항 '{notice.title}' 등록</span>
                    <span className="text-xs text-text-muted shrink-0 ml-4">{formatDate(notice.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-sm font-medium mb-4">빠른 통계</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
              <span>미결 견적</span>
              <span className="font-medium bg-danger/10 text-danger px-2 py-0.5 rounded-full text-xs">
                {pendingEstimateCount ?? "-"}
              </span>
            </li>
            <li className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
              <span>내 연차 승인 대기</span>
              <span className="font-medium text-text px-2 py-0.5 text-xs">{leaveBalance?.pending ?? "-"}일</span>
            </li>
            <li className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
              <span>내 결재 대기</span>
              <span className="font-medium bg-danger/10 text-danger px-2 py-0.5 rounded-full text-xs">
                {approvalInbox.length}
              </span>
            </li>
            {user?.role === "admin" && (
              <li className="flex items-center justify-between bg-bg rounded-xl px-4 py-3">
                <span>이번달 입금액</span>
                <span className="font-medium text-text px-2 py-0.5 text-xs flex items-center gap-1">
                  <Banknote size={12} /> {paymentReport ? formatCurrency(paymentReport.total_deposit) : "-"}
                </span>
              </li>
            )}
          </ul>
        </div>
      </section>
    </MainLayout>
  );
}
