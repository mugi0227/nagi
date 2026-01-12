import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../api/auth';
import { usersApi } from '../api/users';

export function useCurrentUser() {
  const { token } = getAuthToken();
  return useQuery({
    queryKey: ['current-user', token],
    queryFn: usersApi.getMe,
    enabled: !!token,
  });
}
