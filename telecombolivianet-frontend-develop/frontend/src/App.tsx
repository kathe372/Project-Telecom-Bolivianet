import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import MainLayout          from '@/components/layout/MainLayout';
import { ProtectedRoute }  from '@/components/auth/ProtectedRoute';
import { AuthProvider }    from '@/contexts/AuthContext';
import { ErrorBoundary }   from '@/components/shared/ErrorBoundary';


const LoginPage             = lazy(() => import('@/pages/LoginPage'));
const ForgotPasswordPage    = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage     = lazy(() => import('@/pages/ResetPasswordPage'));
const ConfirmEmailPage      = lazy(() => import('@/pages/ConfirmEmailPage'));
const ChangePasswordPage    = lazy(() => import('@/pages/ChangePasswordPage'));
const ProfilePage        = lazy(() => import('@/pages/ProfilePage'));
const UsersPage          = lazy(() => import('@/pages/UsersPage'));
const AuditLogPage       = lazy(() => import('@/pages/AuditLogPage'));
const ForbiddenPage      = lazy(() =>
  import('@/pages/PlaceholderPages').then((m) => ({ default: m.ForbiddenPage }))
);

const ClientsPage        = lazy(() => import('@/pages/ClientsPage'));
const RegisterClientPage = lazy(() => import('@/pages/RegisterClientPage'));
const ClientProfilePage  = lazy(() => import('@/pages/ClientProfilePage'));
const EditClientPage     = lazy(() => import('@/pages/EditClientPage'));
const PlansPage          = lazy(() => import('@/pages/PlansPage'));

const InvoicesPage       = lazy(() => import('@/pages/InvoicesPage'));
const AnnualReportPage   = lazy(() => import('@/pages/AnnualReportPage'));
const PaymentsPage       = lazy(() => import('@/pages/PaymentsPage'));

const TicketsPage        = lazy(() => import('@/pages/TicketsPage'));

const DashboardPage      = lazy(() => import('@/pages/DashboardPage'));

const ConversationsPage        = lazy(() => import('@/pages/ConversationsPage'));
const BotConfigPage             = lazy(() => import('@/pages/BotConfigPage'));
const NotificationsConfigPage   = lazy(() => import('@/pages/NotificationsConfigPage'));

const CoverageMapPage    = lazy(() => import('@/pages/CoverageMapPage'));

const InstallationsPage         = lazy(() => import('@/pages/InstallationsPage'));
const InstallationsCalendarPage = lazy(() => import('@/pages/InstallationsCalendarPage'));
const PlanChangePage     = lazy(() => import('@/pages/PlanChangePage'));
const SettingsPage       = lazy(() => import('@/pages/SettingsPage'));
const BusinessSchedulePage = lazy(() => import('@/pages/BusinessSchedulePage'));


function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}


export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>

            {}
            <Route path="/login"            element={<LoginPage />} />
            <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
            <Route path="/reset-password"   element={<ResetPasswordPage />} />
            <Route path="/confirm-email"    element={<ConfirmEmailPage />} />
            <Route path="/403"              element={<ForbiddenPage />} />

            {}
            <Route path="/change-password" element={
              <ProtectedRoute><ChangePasswordPage /></ProtectedRoute>
            } />

            {}
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />

              {}
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="profile"   element={<ProfilePage />} />

              {}
              <Route path="clients" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><ClientsPage /></ProtectedRoute>
              } />
              <Route path="clients/new" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><RegisterClientPage /></ProtectedRoute>
              } />
              <Route path="clients/:id" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><ClientProfilePage /></ProtectedRoute>
              } />
              <Route path="clients/:id/edit" element={
                <ProtectedRoute allowedRoles={['Admin']}><EditClientPage /></ProtectedRoute>
              } />

              {}
              <Route path="plans" element={
                <ProtectedRoute allowedRoles={['Admin']}><PlansPage /></ProtectedRoute>
              } />

              {}
              <Route path="invoices" element={
                <ProtectedRoute allowedRoles={['Admin']}><InvoicesPage /></ProtectedRoute>
              } />
              <Route path="annual-report" element={
                <ProtectedRoute allowedRoles={['Admin','SocioLectura']}><AnnualReportPage /></ProtectedRoute>
              } />
              <Route path="payments" element={
                <ProtectedRoute allowedRoles={['Admin']}><PaymentsPage /></ProtectedRoute>
              } />

              {}
              <Route path="tickets" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><TicketsPage /></ProtectedRoute>
              } />

              {}
              <Route path="coverage" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><CoverageMapPage /></ProtectedRoute>
              } />
              {}
              <Route path="instalaciones" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><InstallationsPage /></ProtectedRoute>
              } />
              <Route path="instalaciones/calendario" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><InstallationsCalendarPage /></ProtectedRoute>
              } />
              {}
              <Route path="plan-changes" element={
                <ProtectedRoute allowedRoles={['Admin']}><PlanChangePage /></ProtectedRoute>
              } />

              {}
              <Route path="notifications/config" element={
                <ProtectedRoute allowedRoles={['Admin']}><NotificationsConfigPage /></ProtectedRoute>
              } />

              {}
              <Route path="users" element={
                <ProtectedRoute allowedRoles={['Admin']}><UsersPage /></ProtectedRoute>
              } />
              <Route path="audit-logs" element={
                <ProtectedRoute allowedRoles={['Admin']}><AuditLogPage /></ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute allowedRoles={['Admin']}><SettingsPage /></ProtectedRoute>
              } />
              <Route path="settings/horarios" element={
                <ProtectedRoute allowedRoles={['Admin']}><BusinessSchedulePage /></ProtectedRoute>
              } />

              {}
              <Route path="conversaciones" element={
                <ProtectedRoute allowedRoles={['Admin','Tecnico']}><ConversationsPage /></ProtectedRoute>
              } />
              <Route path="bot-config" element={
                <ProtectedRoute allowedRoles={['Admin']}><BotConfigPage /></ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}
