import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import PageLoader from './components/PageLoader';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminSignup = lazy(() => import('./pages/AdminSignup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Participants = lazy(() => import('./pages/Participants'));
const AirlineParticipants = lazy(() => import('./pages/AirlineParticipants'));
const MyTeam = lazy(() => import('./pages/MyTeam'));
const InternalCertificates = lazy(() => import('./pages/InternalCertificates'));
const InternalAssessments = lazy(() => import('./pages/InternalAssessments'));
const AddParticipant = lazy(() => import('./pages/AddParticipant'));
const EditParticipant = lazy(() => import('./pages/EditParticipant'));
const Airlines = lazy(() => import('./pages/Airlines'));
const Contract = lazy(() => import('./pages/Contract'));
const Profile = lazy(() => import('./pages/Profile'));
const ExamResults = lazy(() => import('./pages/ExamResults'));
const AttendanceSheets = lazy(() => import('./pages/AttendanceSheets'));
const DgrForms = lazy(() => import('./pages/DgrForms'));
const ExamSystem = lazy(() => import('./pages/ExamSystem'));
const FeedbackDashboard = lazy(() => import('./pages/FeedbackDashboard'));
const ExamBuilder = lazy(() => import('./pages/ExamBuilder'));
const ExamAttempts = lazy(() => import('./pages/ExamAttempts'));
const AirlineExams = lazy(() => import('./pages/AirlineExams'));
const ExamResultView = lazy(() => import('./pages/ExamResultView'));
const PublicExam = lazy(() => import('./pages/PublicExam'));
const PublicFeedback = lazy(() => import('./pages/PublicFeedback'));
const ParticipantExamPerformance = lazy(() => import('./pages/ParticipantExamPerformance'));
const QuestionBankDetail = lazy(() => import('./pages/QuestionBank').then((m) => ({ default: m.QuestionBankDetail })));
const TeamPage = lazy(() => import('./pages/TeamPage'));

// Requires any authenticated user (admin or airline)
function ProtectedRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <PageLoader fullScreen />;
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}

// Requires admin role — redirects airlines to their own dashboard
function AdminRoute({ children }) {
  const { admin, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!admin) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/airline" replace />; // send airlines home
  return children;
}

// Requires an airline with the admin-granted exam-authoring permission (admins
// pass straight through — they have /admin/exams already).
function ExamAuthorRoute({ children }) {
  const { admin, loading, isAdmin, can } = useAuth();
  if (loading) return null;
  if (!admin) return <Navigate to="/login" replace />;
  if (isAdmin) return children;
  if (!admin.can_author_exams) return <Navigate to="/airline" replace />;
  // A limited additional login needs at least one exam power.
  if (admin.login_restricted && !['exams.author', 'exams.assign', 'exams.grade'].some(can)) return <Navigate to="/airline" replace />;
  return children;
}

// Requires an account that can manage sub-users (super admin, admin/airline
// sub-user with team.manage, or a top-level airline granted can_create_subusers).
function TeamRoute({ children }) {
  const { admin, loading, canManageTeam, isAdmin } = useAuth();
  if (loading) return null;
  if (!admin) return <Navigate to="/login" replace />;
  if (!canManageTeam) return <Navigate to={isAdmin ? '/admin' : '/airline'} replace />;
  return children;
}

// Requires one of the given permission keys (can() already lets top-level
// admin / top-level airline through).
function PermRoute({ perms, children }) {
  const { admin, loading, can, isAdmin } = useAuth();
  if (loading) return null;
  if (!admin) return <Navigate to="/login" replace />;
  if (!perms.some((p) => can(p))) return <Navigate to={isAdmin ? '/admin' : '/airline'} replace />;
  return children;
}

// Redirects logged-in users away from login/signup
function GuestRoute({ children }) {
  const { admin, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (admin) return <Navigate to={isAdmin ? '/admin' : '/airline'} replace />;
  return children;
}

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#000021',
            color: '#fff',
            borderRadius: '12px',
            fontSize: '14px',
          },
        }}
      />
      <Suspense fallback={<PageLoader fullScreen />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login"       element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup"      element={<GuestRoute><Signup /></GuestRoute>} />
        <Route path="/admin-login"    element={<GuestRoute><AdminLogin /></GuestRoute>} />
        <Route path="/admin-signup"   element={<GuestRoute><AdminSignup /></GuestRoute>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Public, passwordless exam link — no login, token in the URL */}
        <Route path="/exam/:token" element={<PublicExam />} />

        {/* Public Customer Training Feedback form — emailed link, no login */}
        <Route path="/feedback/:token" element={<PublicFeedback />} />

        <Route path="/admin" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          {/* Available to all authenticated users */}
          <Route index element={<Dashboard />} />
          <Route path="participants" element={<PermRoute perms={['participants.view']}><Participants /></PermRoute>} />
          <Route path="participants/add" element={<PermRoute perms={['participants.create']}><AddParticipant /></PermRoute>} />
          <Route path="participants/:participantId/performance" element={<ParticipantExamPerformance />} />
          <Route path="profile" element={<Profile />} />

          {/* Admin-only routes — sub-admins are further gated by permission */}
          <Route path="airlines" element={<AdminRoute><PermRoute perms={['airlines.view', 'airlines.manage']}><Airlines /></PermRoute></AdminRoute>} />
          <Route path="contracts" element={<AdminRoute><PermRoute perms={['contracts.manage']}><Contract /></PermRoute></AdminRoute>} />
          <Route path="participants/edit/:id" element={<AdminRoute><PermRoute perms={['participants.edit']}><EditParticipant /></PermRoute></AdminRoute>} />
          <Route path="attendance"   element={<AdminRoute><PermRoute perms={['attendance.view', 'attendance.manage']}><AttendanceSheets /></PermRoute></AdminRoute>} />
          <Route path="exam-results" element={<AdminRoute><PermRoute perms={['examResults.view', 'examResults.manage']}><ExamResults /></PermRoute></AdminRoute>} />
          <Route path="dgr"          element={<AdminRoute><PermRoute perms={['dgr.view', 'dgr.manage']}><DgrForms /></PermRoute></AdminRoute>} />
          <Route path="exams"           element={<AdminRoute><PermRoute perms={['exams.author', 'exams.assign', 'exams.grade']}><ExamSystem /></PermRoute></AdminRoute>} />
          <Route path="feedback"        element={<AdminRoute><PermRoute perms={['exams.author', 'exams.assign', 'exams.grade']}><FeedbackDashboard /></PermRoute></AdminRoute>} />
          <Route path="exams/new"       element={<AdminRoute><ExamBuilder /></AdminRoute>} />
          <Route path="exams/:id/edit"  element={<AdminRoute><ExamBuilder /></AdminRoute>} />
          <Route path="exams/:id/attempts" element={<AdminRoute><ExamAttempts /></AdminRoute>} />
          <Route path="question-bank" element={<Navigate to="/admin/exams?tab=question-bank" replace />} />
          <Route path="question-bank/:bankId" element={<AdminRoute><QuestionBankDetail /></AdminRoute>} />
          <Route path="team" element={<TeamRoute><TeamPage /></TeamRoute>} />
        </Route>

        {/* Airline-friendly URL aliases — same pages, nicer URLs for airline users */}
        <Route path="/airline" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="submissions" element={<PermRoute perms={['participants.view']}><Participants /></PermRoute>} />
          <Route path="participants" element={<PermRoute perms={['participants.view']}><AirlineParticipants /></PermRoute>} />
          <Route path="my-team" element={<PermRoute perms={['participants.view']}><MyTeam /></PermRoute>} />
          <Route path="certificates" element={<PermRoute perms={['participants.view', 'internalCerts.manage']}><InternalCertificates /></PermRoute>} />
          <Route path="assessments" element={<PermRoute perms={['internalAssessments.manage']}><InternalAssessments /></PermRoute>} />
          <Route path="participants/:participantId/performance" element={<ParticipantExamPerformance />} />
          <Route path="enrollment/new" element={<PermRoute perms={['participants.create']}><AddParticipant /></PermRoute>} />
          <Route path="enrollment/:id/edit" element={<PermRoute perms={['participants.edit']}><EditParticipant /></PermRoute>} />
          <Route path="dgr" element={<PermRoute perms={['dgr.view']}><DgrForms /></PermRoute>} />
          <Route path="exams" element={<AirlineExams />} />
          <Route path="exams/manage"       element={<ExamAuthorRoute><ExamSystem /></ExamAuthorRoute>} />
          <Route path="exams/new"          element={<ExamAuthorRoute><PermRoute perms={['exams.author']}><ExamBuilder /></PermRoute></ExamAuthorRoute>} />
          <Route path="exams/:id/edit"     element={<ExamAuthorRoute><PermRoute perms={['exams.author']}><ExamBuilder /></PermRoute></ExamAuthorRoute>} />
          <Route path="exams/:id/attempts" element={<ExamAuthorRoute><ExamAttempts /></ExamAuthorRoute>} />
          <Route path="exams/:examId/result/:attemptId" element={<ExamResultView />} />
          <Route path="team" element={<TeamRoute><TeamPage /></TeamRoute>} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
      </Suspense>
    </TooltipProvider>
  );
}

export default App;
