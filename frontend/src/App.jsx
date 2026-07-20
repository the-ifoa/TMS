import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';
import AdminLogin from './pages/AdminLogin';
import AdminSignup from './pages/AdminSignup';
import Dashboard from './pages/Dashboard';
import Participants from './pages/Participants';
import AddParticipant from './pages/AddParticipant';
import EditParticipant from './pages/EditParticipant';
import Certificates from './pages/Certificates';
import Airlines from './pages/Airlines';
import Contract from './pages/Contract';
import Profile from './pages/Profile';
import ExamResults from './pages/ExamResults';
import AttendanceSheets from './pages/AttendanceSheets';
import DgrForms from './pages/DgrForms';

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

// Redirects logged-in users away from login/signup
function GuestRoute({ children }) {
  const { admin, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (admin) return <Navigate to={isAdmin ? '/admin' : '/airline'} replace />;
  return children;
}

function App() {
  return (
    <>
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

        <Route path="/admin" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          {/* Available to all authenticated users */}
          <Route index element={<Dashboard />} />
          <Route path="participants" element={<Participants />} />
          <Route path="participants/add" element={<AddParticipant />} />
          <Route path="profile" element={<Profile />} />

          {/* Admin-only routes */}
          <Route path="airlines" element={<AdminRoute><Airlines /></AdminRoute>} />
          <Route path="contracts" element={<AdminRoute><Contract /></AdminRoute>} />
          <Route path="participants/edit/:id" element={<AdminRoute><EditParticipant /></AdminRoute>} />
          <Route path="certificates" element={<AdminRoute><Certificates /></AdminRoute>} />
          <Route path="attendance"   element={<AdminRoute><AttendanceSheets /></AdminRoute>} />
          <Route path="exam-results" element={<AdminRoute><ExamResults /></AdminRoute>} />
          <Route path="dgr"          element={<AdminRoute><DgrForms /></AdminRoute>} />
        </Route>

        {/* Airline-friendly URL aliases — same pages, nicer URLs for airline users */}
        <Route path="/airline" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="submissions" element={<Participants />} />
          <Route path="enrollment/new" element={<AddParticipant />} />
          <Route path="dgr" element={<DgrForms />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
