import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuthToken } from '../../api/auth';

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const { token } = getAuthToken();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
