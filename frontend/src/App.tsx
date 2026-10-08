import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { MenuPermissionKey } from "./lib/auth";
import { MobileApprovalsPage } from "./features/mobile/MobileApprovalsPage";
import { MobileAttendancePage } from "./features/mobile/MobileAttendancePage";
import { MobileClientsPage } from "./features/mobile/MobileClientsPage";
import { MobileHome } from "./features/mobile/MobileHome";
import { MobileLeavesPage } from "./features/mobile/MobileLeavesPage";
import { MobileNoticesPage } from "./features/mobile/MobileNoticesPage";
import { MobileNotificationsPage } from "./features/mobile/MobileNotificationsPage";
import { MobileSchedulePage } from "./features/mobile/MobileSchedulePage";
import { shouldUseMobile } from "./features/mobile/mobileMode";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { SiteAdminDashboardPage } from "./features/dashboard/SiteAdminDashboardPage";
import { LoginPage } from "./features/auth/LoginPage";
import { NoticesPage } from "./features/notices/NoticesPage";
import { NoticeDetailPage } from "./features/notices/NoticeDetailPage";
import { NoticeFormPage } from "./features/notices/NoticeFormPage";
import { ApprovalHubPage } from "./features/approvalHub/ApprovalHubPage";
import { LeavesPage } from "./features/leaves/LeavesPage";
import { DocumentsPage } from "./features/documents/DocumentsPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { ClientDetailPage } from "./features/clients/ClientDetailPage";
import { ClientFormPage } from "./features/clients/ClientFormPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { ProjectFormPage } from "./features/projects/ProjectFormPage";
import { ProjectDetailPage } from "./features/projects/ProjectDetailPage";
import { ProjectDocumentsPage } from "./features/projectDocuments/ProjectDocumentsPage";
import { ProjectDocumentFormPage } from "./features/projectDocuments/ProjectDocumentFormPage";
import { ProposalFormPage } from "./features/proposals/ProposalFormPage";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { TransactionFormPage } from "./features/transactions/TransactionFormPage";
import { PaymentsPage } from "./features/payments/PaymentsPage";
import { PaymentFormPage } from "./features/payments/PaymentFormPage";
import { UsersPage } from "./features/settings/UsersPage";
import { UserFormPage } from "./features/settings/UserFormPage";
import { CalendarPage } from "./features/schedule/CalendarPage";

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
  return (
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
        path="/settings"
        element={
          <ProtectedRoute requireAdmin siteAdminAllowed>
            <UsersPage />
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
  );
}

export default App;
