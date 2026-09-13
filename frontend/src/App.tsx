import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./layouts/Layout";
import { LoadingPage } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Assignments from "./pages/Assignments";
import AssignmentDetail from "./pages/AssignmentDetail";
import ProblemPage from "./pages/ProblemPage";
import Submissions from "./pages/Submissions";
import SubmissionDetailPage from "./pages/SubmissionDetail";
import Leaderboard from "./pages/Leaderboard";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminAssignments from "./pages/admin/AdminAssignments";
import { NewAssignmentPage } from "./pages/admin/AssignmentForm";
import AdminAssignmentEdit from "./pages/admin/AdminAssignmentEdit";
import AdminProblemEdit from "./pages/admin/AdminProblemEdit";
import { NewProblemPage } from "./pages/admin/ProblemForm";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminSubmissions from "./pages/admin/AdminSubmissions";
import AdminAnalytics from "./pages/admin/AdminAnalytics";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingPage />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Admin + mentor — anything that requires assignment/problem editing rights. */
function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;
  if (user?.role !== "ADMIN" && user?.role !== "MENTOR") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingPage />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AdminLeaderboard() {
  const [params] = useSearchParams();
  const assignmentId = params.get("assignment") ?? undefined;
  return <Leaderboard assignmentId={assignmentId} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />

          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/assignments/:id" element={<AssignmentDetail />} />
            <Route path="/assignments/:id/leaderboard" element={<Leaderboard />} />
            <Route path="/problems/:id" element={<ProblemPage />} />
            <Route path="/submissions" element={<Submissions />} />
            <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/admin" element={<RequireAdmin><AdminOverview /></RequireAdmin>} />
            <Route path="/admin/assignments" element={<RequireStaff><AdminAssignments /></RequireStaff>} />
            <Route path="/admin/assignments/new" element={<RequireStaff><NewAssignmentPage /></RequireStaff>} />
            <Route path="/admin/assignments/:id" element={<RequireStaff><AdminAssignmentEdit /></RequireStaff>} />
            <Route path="/admin/problems/new" element={<RequireStaff><NewProblemPage /></RequireStaff>} />
            <Route path="/admin/problems/:id" element={<RequireStaff><AdminProblemEdit /></RequireStaff>} />
            <Route path="/admin/students" element={<RequireAdmin><AdminStudents /></RequireAdmin>} />
            <Route path="/admin/submissions" element={<RequireAdmin><AdminSubmissions /></RequireAdmin>} />
            <Route path="/admin/analytics" element={<RequireAdmin><AdminAnalytics /></RequireAdmin>} />
            <Route path="/admin/leaderboard" element={<RequireAdmin><AdminLeaderboard /></RequireAdmin>} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}