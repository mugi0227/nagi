import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../api/chat';
import { userStorage } from '../utils/userStorage';
import type {
  ChatRequest,
  ChatResponse,
  ChatMode,
  ChatSession,
  ChatHistoryMessage,
  TaskCreate,
  ProjectCreate,
  MemoryCreate,
  TaskAssignmentProposal,
} from '../api/types';

export interface ToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  status: 'running' | 'completed';
}

export interface ProposalInfo {
  id: string;
  proposalId: string;
  proposalType: 'create_task' | 'create_project' | 'create_skill' | 'assign_task';
  description: string;
  payload: TaskCreate | ProjectCreate | MemoryCreate | TaskAssignmentProposal;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  proposals?: ProposalInfo[]; // AI提案リスト
  isStreaming?: boolean;
  imageUrl?: string;  // For image attachments
}

const SESSION_STORAGE_KEY = 'chat_session_id';

export function useChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionIdState] = useState<string | undefined>(() => {
    return userStorage.get(SESSION_STORAGE_KEY) || undefined;
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const hasLoadedInitialHistory = useRef(false);

  const setSessionId = useCallback((id?: string) => {
    setSessionIdState(id);
    if (id) {
      userStorage.set(SESSION_STORAGE_KEY, id);
    } else {
      userStorage.remove(SESSION_STORAGE_KEY);
    }
  }, []);

  const mutation = useMutation({
    mutationFn: (request: ChatRequest) => chatApi.sendMessage(request),
    onSuccess: (response: ChatResponse) => {
      // Add assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.assistant_message,
          timestamp: new Date(),
        },
      ]);

      // Update session ID
      if (response.session_id) {
        setSessionId(response.session_id);
      }
    },
  });

  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const data = await chatApi.listSessions();
      setSessions(data);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const loadHistory = useCallback(async (targetSessionId: string) => {
    setIsLoadingHistory(true);
    try {
      const history = await chatApi.getHistory(targetSessionId);
      const mapped = history
        .filter((item) => item.role !== 'system')
        .map((item: ChatHistoryMessage): Message => ({
          id: crypto.randomUUID(),
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: item.content,
          timestamp: item.created_at ? new Date(item.created_at) : new Date(),
        }));
      setMessages(mapped);
      setSessionId(targetSessionId);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [setSessionId]);

  const initialSessionId = useRef(sessionId);

  useEffect(() => {
    if (hasLoadedInitialHistory.current) {
      return;
    }

    const bootstrapHistory = async () => {
      if (initialSessionId.current) {
        await loadHistory(initialSessionId.current);
        hasLoadedInitialHistory.current = true;
        return;
      }

      try {
        const data = await chatApi.listSessions();
        setSessions(data);
        if (data.length > 0) {
          await loadHistory(data[0].session_id);
        }
      } finally {
        hasLoadedInitialHistory.current = true;
      }
    };

    bootstrapHistory();
  }, [loadHistory]);

  useEffect(() => {
    const handleAuthChange = () => {
      setMessages([]);
      setSessions([]);
      hasLoadedInitialHistory.current = false;
      const storedSession = userStorage.get(SESSION_STORAGE_KEY) || undefined;
      setSessionIdState(storedSession);
    };
    window.addEventListener('auth-changed', handleAuthChange);
    return () => {
      window.removeEventListener('auth-changed', handleAuthChange);
    };
  }, []);

  const sendMessageStream = useCallback(
    async (text: string, imageBase64?: string, mode?: ChatMode) => {
      // Add user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        imageUrl: imageBase64,
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create assistant message placeholder
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [],
        proposals: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      setIsStreaming(true);

      try {
        // Get proposal mode from user-scoped storage
        const proposalMode = userStorage.get('aiProposalMode') === 'true';

        // Stream response
        for await (const chunk of chatApi.streamMessage({
          text,
          image_base64: imageBase64,
          mode,
          session_id: sessionId,
          proposal_mode: proposalMode,
        })) {
          switch (chunk.chunk_type) {
            case 'tool_start':
              // Add new tool call
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        toolCalls: [
                          ...(msg.toolCalls || []),
                          {
                            id: crypto.randomUUID(),
                            name: chunk.tool_name || 'unknown',
                            args: chunk.tool_args,
                            status: 'running' as const,
                          },
                        ],
                      }
                    : msg
                )
              );
              break;

            case 'tool_end':
              // Update tool call with result
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        toolCalls: msg.toolCalls?.map((tc) =>
                          tc.name === chunk.tool_name && tc.status === 'running'
                            ? {
                                ...tc,
                                result: chunk.tool_result,
                                status: 'completed' as const,
                              }
                            : tc
                        ),
                      }
                    : msg
                )
              );
              break;

            case 'text':
              // Append text character by character
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: msg.content + (chunk.content || ''),
                      }
                    : msg
                )
              );
              break;

            case 'done':
              // Finalize message
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        isStreaming: false,
                      }
                    : msg
                )
              );

              if (chunk.session_id) {
                setSessionId(chunk.session_id);
              }

              // Invalidate queries to refresh data
              queryClient.invalidateQueries({ queryKey: ['tasks'] });
              queryClient.invalidateQueries({ queryKey: ['top3'] });
              queryClient.invalidateQueries({ queryKey: ['projects'] });
              break;

            case 'proposal':
              // Add proposal to message
              if (chunk.proposal_id && chunk.proposal_type && chunk.payload) {
                const proposalInfo: ProposalInfo = {
                  id: crypto.randomUUID(),
                  proposalId: chunk.proposal_id,
                  proposalType: chunk.proposal_type as 'create_task' | 'create_project' | 'create_skill' | 'assign_task',
                  description: chunk.description || '',
                  payload: chunk.payload as unknown as TaskCreate | ProjectCreate | MemoryCreate | TaskAssignmentProposal,
                };
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          proposals: [
                            ...(msg.proposals || []),
                            proposalInfo,
                          ],
                        }
                      : msg
                  )
                );
              }
              break;

            case 'error':
              // Show error
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: chunk.content || 'エラーが発生しました',
                        isStreaming: false,
                      }
                    : msg
                )
              );
              break;
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: 'エラーが発生しました',
                  isStreaming: false,
                }
              : msg
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [queryClient, sessionId, setSessionId]
  );

  const sendMessage = useCallback(
    (text: string, mode?: ChatMode, imageUrl?: string) => {
      // Add user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        imageUrl,  // Include image URL in message
      };
      setMessages((prev) => [...prev, userMessage]);

      // Send to API
      mutation.mutate({
        text,
        mode,
        session_id: sessionId,
        image_url: imageUrl,  // Send image URL to API
      });
    },
    [mutation, sessionId]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
  }, [setSessionId]);

  return {
    messages,
    sendMessage,
    sendMessageStream,
    clearChat,
    sessions,
    fetchSessions,
    loadHistory,
    sessionId,
    isLoadingSessions,
    isLoadingHistory,
    isLoading: mutation.isPending || isStreaming,
    error: mutation.error,
  };
}
