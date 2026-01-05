import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { TasksPage } from './pages/TasksPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { AchievementPage } from './pages/AchievementPage';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';
import { InvitationAcceptPage } from './pages/InvitationAcceptPage';
import { OidcCallbackPage } from './pages/OidcCallbackPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
    },
  },
});

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<OidcCallbackPage />} />
        <Route path="/invite/accept" element={<InvitationAcceptPage />} />
        <Route
          path="/"
          element={(
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          )}
        >
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="achievement" element={<AchievementPage />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
