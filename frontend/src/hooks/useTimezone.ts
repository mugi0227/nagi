import { useEffect, useMemo } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { getStoredTimezone, setStoredTimezone } from '../utils/dateTime';

export const useTimezone = () => {
  const { data: currentUser } = useCurrentUser();

  const timezone = useMemo(
    () => currentUser?.timezone || getStoredTimezone(),
    [currentUser?.timezone],
  );

  useEffect(() => {
    if (currentUser?.timezone) {
      setStoredTimezone(currentUser.timezone);
    }
  }, [currentUser?.timezone]);

  return timezone;
};
