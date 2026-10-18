import { Suspense, lazy, useEffect, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { MenuPermissionKey } from "./lib/auth";
import { MobileHome } from "./features/mobile/MobileHome";
import { shouldUseMobile } from "./features/mobile/mobileMode";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { useAuth } from "./context/useAuth";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { SiteAdminDashboardPage } from "./features/dashboard/SiteAdminDashboardPage";
import { LoginPage } from "./features/auth/LoginPage";
import { useOpenConversationFromDesktop } from "./features/messenger/useOpenConversationFromDesktop";

// 화면별로 JS 를 나눠 첫 화면(로그인·대시보드)을 가볍게 한다. 나머지 화면은 처음 열 때 받아오고,
// 로그인 뒤 브라우저가 한가할 때 미리 받아 두어 메뉴를 옮길 때 기다리지 않게 한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;
const pageLoaders: (() => Promise<unknown>)[] = [];
function lazyPage<K extends string, C extends AnyComponent>(load: () => Promise<Record<K, C>>, name: K) {
  pageLoaders.push(load);
  return lazy(async () => ({ default: (await load())[name] }));
}
const MobileApprovalsPage = lazyPage(() => import("./features/mobile/MobileApprovalsPage"), "MobileApprovalsPage");
const MobileAttendancePage = lazyPage(() => import("./features/mobile/MobileAttendancePage"), "MobileAttendancePage");
const MobileClientsPage = lazyPage(() => import("./features/mobile/MobileClientsPage"), "MobileClientsPage");
const MobileLeavesPage = lazyPage(() => import("./features/mobile/MobileLeavesPage"), "MobileLeavesPage");
const MobileNoticesPage = lazyPage(() => import("./features/mobile/MobileNoticesPage"), "MobileNoticesPage");
const MobileNotificationsPage = lazyPage(() => import("./features/mobile/MobileNotificationsPage"), "MobileNotificationsPage");
const MobileSchedulePage = lazyPage(() => import("./features/mobile/MobileSchedulePage"), "MobileSchedulePage");
const NoticesPage = lazyPage(() => import("./features/notices/NoticesPage"), "NoticesPage");
const NoticeDetailPage = lazyPage(() => import("./features/notices/NoticeDetailPage"), "NoticeDetailPage");
const NoticeFormPage = lazyPage(() => import("./features/notices/NoticeFormPage"), "NoticeFormPage");
const ApprovalHubPage = lazyPage(() => import("./features/approvalHub/ApprovalHubPage"), "ApprovalHubPage");
const LeavesPage = lazyPage(() => import("./features/leaves/LeavesPage"), "LeavesPage");
const DocumentsPage = lazyPage(() => import("./features/documents/DocumentsPage"), "DocumentsPage");
const ClientsPage = lazyPage(() => import("./features/clients/ClientsPage"), "ClientsPage");
const ClientDetailPage = lazyPage(() => import("./features/clients/ClientDetailPage"), "ClientDetailPage");
const ClientFormPage = lazyPage(() => import("./features/clients/ClientFormPage"), "ClientFormPage");
const ProjectsPage = lazyPage(() => import("./features/projects/ProjectsPage"), "ProjectsPage");
const ProjectFormPage = lazyPage(() => import("./features/projects/ProjectFormPage"), "ProjectFormPage");
const ProjectDetailPage = lazyPage(() => import("./features/projects/ProjectDetailPage"), "ProjectDetailPage");
const ProjectDocumentsPage = lazyPage(() => import("./features/projectDocuments/ProjectDocumentsPage"), "ProjectDocumentsPage");
const ProjectDocumentFormPage = lazyPage(() => import("./features/projectDocuments/ProjectDocumentFormPage"), "ProjectDocumentFormPage");
const ProposalFormPage = lazyPage(() => import("./features/proposals/ProposalFormPage"), "ProposalFormPage");
const TransactionsPage = lazyPage(() => import("./features/transactions/TransactionsPage"), "TransactionsPage");
const TransactionFormPage = lazyPage(() => import("./features/transactions/TransactionFormPage"), "TransactionFormPage");
const PaymentsPage = lazyPage(() => import("./features/payments/PaymentsPage"), "PaymentsPage");
const PaymentFormPage = lazyPage(() => import("./features/payments/PaymentFormPage"), "PaymentFormPage");
const UsersPage = lazyPage(() => import("./features/settings/UsersPage"), "UsersPage");
const DevicesPage = lazyPage(() => import("./features/settings/DevicesPage"), "DevicesPage");
const AuditLogsPage = lazyPage(() => import("./features/settings/AuditLogsPage"), "AuditLogsPage");
const UserFormPage = lazyPage(() => import("./features/settings/UserFormPage"), "UserFormPage");
const MessengerPage = lazyPage(() => import("./features/messenger/MessengerPage"), "MessengerPage");
const MailPage = lazyPage(() => import("./features/mail/MailPage"), "MailPage");
const CalendarPage = lazyPage(() => import("./features/schedule/CalendarPage"), "CalendarPage");

function usePrefetchPages(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      console.debug(`[App] 화면 미리 받기: ${pageLoaders.length}개`);
      pageLoaders.forEach((load) => load().catch(() => undefined));
    };
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const handle = idle(run);
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(handle);
  }, [enabled]);
}

const pageFallback = <p className="p-8 text-sm text-text-muted">불러오는 중...</p>;

function DashboardRoute() {
  const { user } = useAuth();
  // 폰 화면 폭으로 처음 접속하면 모바일 화면으로 보낸다 (모바일 홈의 "PC 화면으로 보기"로 이 탭에서는 해제 가능).
  if (shouldUseMobile()) return <Navigate to="/m" replace />;
  return user?.role === "site_admin" ? <SiteAdminDashboardPage /> : <DashboardPage />;
}

/** 모바일 화면(/m/*) 공통 접근 규칙: 로그인 필수, 메뉴 권한은 PC와 동일하게 적용한다. */
function mobileRoute(element: ReactNode, options: { menuKey?: MenuPermissionKey; siteAdminAllowed?: boolean } = {}) {
  return (
    <ProtectedRoute siteAdminAllowed={options.siteAdminAllowed} menuKey={options.menuKey}>
      {element}
    </ProtectedRoute>
  );
}

function App() {
  const { user } = useAuth();
  usePrefetchPages(user !== null);
  useOpenConversationFromDesktop(); // 앱에서 메시지 알림을 누르면 그 대화방으로
  return (
    <Suspense fallback={pageFallback}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/m" element={mobileRoute(<MobileHome />, { siteAdminAllowed: true })} />
      <Route path="/m/attendance" element={mobileRoute(<MobileAttendancePage />)} />
      <Route path="/m/leaves" element={mobileRoute(<MobileLeavesPage />)} />
      <Route path="/m/notices" element={mobileRoute(<MobileNoticesPage />, { menuKey: "notices", siteAdminAllowed: true })} />
      <Route path="/m/schedule" element={mobileRoute(<MobileSchedulePage />, { siteAdminAllowed: true })} />
      <Route path="/m/clients" element={mobileRoute(<MobileClientsPage />, { menuKey: "clients" })} />
      <Route path="/m/notifications" element={mobileRoute(<MobileNotificationsPage />, { siteAdminAllowed: true })} />
      <Route path="/m/approvals" element={mobileRoute(<MobileApprovalsPage />)} />

      <Route
        path="/"
        element={
          <ProtectedRoute siteAdminAllowed>
            <DashboardRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute siteAdminAllowed>
            <CalendarPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/approval"
        element={
          <ProtectedRoute>
            <ApprovalHubPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leaves"
        element={
          <ProtectedRoute>
            <LeavesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <ProtectedRoute>
            <DocumentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute menuKey="projects">
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute menuKey="projects">
            <ProjectFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute menuKey="projects">
            <ProjectDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/documents/new"
        element={
          <ProtectedRoute menuKey="projects">
            <ProjectDocumentFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/project-documents"
        element={
          <ProtectedRoute>
            <ProjectDocumentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/project-documents/new"
        element={
          <ProtectedRoute>
            <ProjectDocumentFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/proposals/new"
        element={
          <ProtectedRoute>
            <ProposalFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute menuKey="clients">
            <ClientsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/new"
        element={
          <ProtectedRoute menuKey="clients">
            <ClientFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute menuKey="clients">
            <ClientDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id/edit"
        element={
          <ProtectedRoute menuKey="clients">
            <ClientFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tax-invoices"
        element={
          <ProtectedRoute menuKey="tax_invoice">
            <ProjectDocumentsPage lockedDocType="tax_invoice" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute menuKey="transactions">
            <TransactionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions/new"
        element={
          <ProtectedRoute menuKey="transactions">
            <TransactionFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions/:id/edit"
        element={
          <ProtectedRoute menuKey="transactions">
            <TransactionFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute menuKey="payments">
            <PaymentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments/:id/edit"
        element={
          <ProtectedRoute menuKey="payments">
            <PaymentFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments/new"
        element={
          <ProtectedRoute menuKey="payments">
            <PaymentFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notices"
        element={
          <ProtectedRoute siteAdminAllowed menuKey="notices">
            <NoticesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notices/new"
        element={
          <ProtectedRoute requireAdmin siteAdminAllowed>
            <NoticeFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notices/:id"
        element={
          <ProtectedRoute siteAdminAllowed menuKey="notices">
            <NoticeDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notices/:id/edit"
        element={
          <ProtectedRoute requireAdmin siteAdminAllowed>
            <NoticeFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mail"
        element={
          <ProtectedRoute siteAdminAllowed>
            <MailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messenger"
        element={
          <ProtectedRoute siteAdminAllowed>
            <MessengerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messenger/:conversationId"
        element={
          <ProtectedRoute siteAdminAllowed>
            <MessengerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute requireAdmin siteAdminAllowed>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/audit-logs"
        element={
          // 대표 전용 (사이트 관리자는 볼 수 없다: 서버 API 도 대표만 허용)
          <ProtectedRoute requireAdmin>
            <AuditLogsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/devices"
        element={
          // 대표 전용 (서버 API 도 대표만 허용): 어느 PC 에서 카드 로그인을 받을지는 대표가 정한다
          <ProtectedRoute requireAdmin>
            <DevicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/users/new"
        element={
          <ProtectedRoute requireAdmin siteAdminAllowed>
            <UserFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/users/:id/edit"
        element={
          <ProtectedRoute requireAdmin siteAdminAllowed>
            <UserFormPage />
          </ProtectedRoute>
        }
      />
    </Routes>
    </Suspense>
  );
}

export default App;
