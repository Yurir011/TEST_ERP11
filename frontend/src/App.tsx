import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { SiteAdminDashboardPage } from "./features/dashboard/SiteAdminDashboardPage";
import { LoginPage } from "./features/auth/LoginPage";
import { NoticesPage } from "./features/notices/NoticesPage";
import { NoticeDetailPage } from "./features/notices/NoticeDetailPage";
import { NoticeFormPage } from "./features/notices/NoticeFormPage";
import { AttendancePage } from "./features/attendance/AttendancePage";
import { LeavesPage } from "./features/leaves/LeavesPage";
import { DocumentsPage } from "./features/documents/DocumentsPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { ClientDetailPage } from "./features/clients/ClientDetailPage";
import { ClientFormPage } from "./features/clients/ClientFormPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { ProjectFormPage } from "./features/projects/ProjectFormPage";
import { ProjectDetailPage } from "./features/projects/ProjectDetailPage";
import { SalesDocumentFormPage } from "./features/projects/SalesDocumentFormPage";
import { ProjectDocumentsPage } from "./features/projectDocuments/ProjectDocumentsPage";
import { ProjectDocumentFormPage } from "./features/projectDocuments/ProjectDocumentFormPage";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { TransactionFormPage } from "./features/transactions/TransactionFormPage";
import { PaymentsPage } from "./features/payments/PaymentsPage";
import { PaymentFormPage } from "./features/payments/PaymentFormPage";
import { UsersPage } from "./features/settings/UsersPage";
import { UserFormPage } from "./features/settings/UserFormPage";
import { CalendarPage } from "./features/schedule/CalendarPage";

function DashboardRoute() {
  const { user } = useAuth();
  return user?.role === "site_admin" ? <SiteAdminDashboardPage /> : <DashboardPage />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

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
        path="/attendance"
        element={
          <ProtectedRoute>
            <AttendancePage />
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
            <SalesDocumentFormPage />
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
