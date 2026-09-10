import {
  Banknote,
  Building2,
  CalendarPlus,
  ClipboardCheck,
  FolderKanban,
  Megaphone,
  Timer,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { QuickActionCard } from "../../components/ui/QuickActionCard";
import { StatCard } from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import { apiGet } from "../../lib/api";
import { formatCurrency, formatDate } from "../../lib/format";
import { logDebug, logError } from "../../lib/logger";
import type { Notice } from "../notices/types";
import type { LeaveBalance } from "../leaves/types";
import type { Client } from "../clients/types";
import type { Project } from "../projects/types";
import type { PaymentReport } from "../payments/types";

interface HealthResponse {
  status: string;
  app: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [recentNotices, setRecentNotices] = useState<Notice[] | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [inProgressCount, setInProgressCount] = useState<number | null>(null);
  const [pendingEstimateCount, setPendingEstimateCount] = useState<number | null>(null);
  const [paymentReport, setPaymentReport] = useState<PaymentReport | null>(null);

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

      <section className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="이번달 정상 출근" value="18일" change="전월 대비 +2일" trend="up" icon={Timer} />
        <StatCard
          label="잔여 연차"
          value={leaveBalance ? `${leaveBalance.remaining}일` : "-"}
          change={leaveBalance ? `총 ${leaveBalance.granted}일 중` : undefined}
          icon={Users}
        />
        <StatCard
          label="진행중 프로젝트"
          value={inProgressCount === null ? "-" : `${inProgressCount}건`}
          icon={FolderKanban}
        />
        <StatCard label="거래처 수" value={clientCount === null ? "-" : `${clientCount}곳`} icon={Building2} />
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
