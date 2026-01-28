import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '../api/auth';
import { getBaseUrl } from '../api/client';

type RealtimeEvent = {
  type: string;
  path?: string;
  method?: string;
};

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => getAuthToken().token);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleAuthChanged = () => {
      setToken(getAuthToken().token);
    };
    window.addEventListener('auth-changed', handleAuthChanged);
    return () => {
      window.removeEventListener('auth-changed', handleAuthChanged);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let isActive = true;
    let retryDelay = 1000;

    const scheduleInvalidate = () => {
      if (debounceRef.current) return;
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        queryClient.invalidateQueries();
      }, 200);
    };

    const connect = async () => {
      while (isActive) {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const response = await fetch(`${getBaseUrl()}/realtime/stream`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          retryDelay = 1000;
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Response body is not readable');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (isActive) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (!raw) continue;
              try {
                const event = JSON.parse(raw) as RealtimeEvent;
                if (event.type === 'refresh') {
                  scheduleInvalidate();
                }
              } catch (err) {
                console.error('Failed to parse realtime event:', raw, err);
              }
            }
          }

          reader.releaseLock();
        } catch {
          if (!isActive) {
            break;
          }
        }

        if (!isActive) break;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 10_000);
      }
    };

    connect();

    return () => {
      isActive = false;
      abortRef.current?.abort();
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [queryClient, token]);
}
