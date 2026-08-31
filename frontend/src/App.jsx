import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';
import AdminLogin from './pages/AdminLogin';
import AdminSignup from './pages/AdminSignup';
import Dashboard from './pages/Dashboard';
import Participants from './pages/Participants';
import AirlineParticipants from './pages/AirlineParticipants';
import AddParticipant from './pages/AddParticipant';
import EditParticipant from './pages/EditParticipant';
import Airlines from './pages/Airlines';
import Contract from './pages/Contract';
import Profile from './pages/Profile';
import ExamResults from './pages/ExamResults';
import AttendanceSheets from './pages/AttendanceSheets';
import DgrForms from './pages/DgrForms';
import ExamSystem from './pages/ExamSystem';
import ExamBuilder from './pages/ExamBuilder';
import ExamAttempts from './pages/ExamAttempts';
import AirlineExams from './pages/AirlineExams';
import ExamResultView from './pages/ExamResultView';
import PublicExam from './pages/PublicExam';
import ParticipantExamPerformance from './pages/ParticipantExamPerformance';
import QuestionBank, { QuestionBankDetail } from './pages/QuestionBank';

// Requires any authenticated user (admin or airline)
function ProtectedRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-primary-300 border-t-primary-800 rounded-full animate-spin" />
      </div>
    );
  }
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
  const { admin, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!admin) return <Navigate to="/login" replace />;
  if (isAdmin) return children;
  if (!admin.can_author_exams) return <Navigate to="/airline" replace />;
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
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login"       element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup"      element={<GuestRoute><Signup /></GuestRoute>} />
        <Route path="/admin-login"    element={<GuestRoute><AdminLogin /></GuestRoute>} />
        <Route path="/admin-signup"   element={<GuestRoute><AdminSignup /></GuestRoute>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Public, passwordless exam link — no login, token in the URL */}
        <Route path="/exam/:token" element={<PublicExam />} />

        <Route path="/admin" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          {/* Available to all authenticated users */}
          <Route index element={<Dashboard />} />
          <Route path="participants" element={<Participants />} />
          <Route path="participants/add" element={<AddParticipant />} />
          <Route path="participants/:participantId/performance" element={<ParticipantExamPerformance />} />
          <Route path="profile" element={<Profile />} />

          {/* Admin-only routes */}
          <Route path="airlines" element={<AdminRoute><Airlines /></AdminRoute>} />
          <Route path="contracts" element={<AdminRoute><Contract /></AdminRoute>} />
          <Route path="participants/edit/:id" element={<AdminRoute><EditParticipant /></AdminRoute>} />
          <Route path="attendance"   element={<AdminRoute><AttendanceSheets /></AdminRoute>} />
          <Route path="exam-results" element={<AdminRoute><ExamResults /></AdminRoute>} />
          <Route path="dgr"          element={<AdminRoute><DgrForms /></AdminRoute>} />
          <Route path="exams"           element={<AdminRoute><ExamSystem /></AdminRoute>} />
          <Route path="exams/new"       element={<AdminRoute><ExamBuilder /></AdminRoute>} />
          <Route path="exams/:id/edit"  element={<AdminRoute><ExamBuilder /></AdminRoute>} />
          <Route path="exams/:id/attempts" element={<AdminRoute><ExamAttempts /></AdminRoute>} />
          <Route path="question-bank" element={<Navigate to="/admin/exams?tab=question-bank" replace />} />
          <Route path="question-bank/:bankId" element={<AdminRoute><QuestionBankDetail /></AdminRoute>} />
        </Route>

        {/* Airline-friendly URL aliases — same pages, nicer URLs for airline users */}
        <Route path="/airline" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="submissions" element={<Participants />} />
          <Route path="participants" element={<AirlineParticipants />} />
          <Route path="participants/:participantId/performance" element={<ParticipantExamPerformance />} />
          <Route path="enrollment/new" element={<AddParticipant />} />
          <Route path="dgr" element={<DgrForms />} />
          <Route path="exams" element={<AirlineExams />} />
          <Route path="exams/manage"       element={<ExamAuthorRoute><ExamSystem /></ExamAuthorRoute>} />
          <Route path="exams/new"          element={<ExamAuthorRoute><ExamBuilder /></ExamAuthorRoute>} />
          <Route path="exams/:id/edit"     element={<ExamAuthorRoute><ExamBuilder /></ExamAuthorRoute>} />
          <Route path="exams/:id/attempts" element={<ExamAuthorRoute><ExamAttempts /></ExamAuthorRoute>} />
          <Route path="exams/:examId/result/:attemptId" element={<ExamResultView />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </TooltipProvider>
  );
}

export default App;
