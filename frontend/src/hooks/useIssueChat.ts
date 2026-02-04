import { useCallback, useMemo, useRef, useState } from 'react';
import { issuesApi } from '../api/issues';
import type { IssueChatChunk, PendingQuestion } from '../api/types';

export interface IssueChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
    result?: unknown;
    status: 'running' | 'completed';
  }>;
  questions?: PendingQuestion[];
  questionsContext?: string;
}

export interface PendingQuestionsData {
  messageId: string;
  questions: PendingQuestion[];
  context?: string;
}

export function useIssueChat() {
  const [messages, setMessages] = useState<IssueChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [processedQuestionMessageIds, setProcessedQuestionMessageIds] = useState<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Extract pending questions from messages
  const pendingQuestionsData = useMemo((): PendingQuestionsData | null => {
    for (const msg of messages) {
      if (msg.questions && msg.questions.length > 0 && !processedQuestionMessageIds.has(msg.id)) {
        return { messageId: msg.id, questions: msg.questions, context: msg.questionsContext };
      }
    }
    return null;
  }, [messages, processedQuestionMessageIds]);

  const markQuestionsProcessed = useCallback(() => {
    if (pendingQuestionsData) {
      setProcessedQuestionMessageIds((prev) => new Set([...prev, pendingQuestionsData.messageId]));
    }
  }, [pendingQuestionsData]);

  const sendMessage = useCallback(async (text: string, imageBase64?: string) => {
    if ((!text.trim() && !imageBase64) || isStreaming) return;

    // Add user message
    const userMessage: IssueChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      imageBase64,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Start streaming
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    // Add assistant message placeholder
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: IssueChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      toolCalls: [],
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      for await (const chunk of issuesApi.chatStream(text, sessionId, imageBase64)) {
        handleChunk(chunk, assistantMessageId);
      }
    } catch (error) {
      console.error('Issue chat error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: m.content || 'エラーが発生しました。もう一度お試しください。',
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId ? { ...m, isStreaming: false } : m
        )
      );
    }
  }, [isStreaming, sessionId]);

  const handleChunk = (chunk: IssueChatChunk, messageId: string) => {
    switch (chunk.chunk_type) {
      case 'session':
        if (chunk.session_id) {
          setSessionId(chunk.session_id);
        }
        break;

      case 'text':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: m.content + (chunk.content || '') }
              : m
          )
        );
        break;

      case 'tool_start':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls || []),
                    {
                      name: chunk.tool_name || '',
                      args: chunk.tool_args,
                      status: 'running' as const,
                    },
                  ],
                }
              : m
          )
        );
        break;

      case 'tool_end':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  toolCalls: m.toolCalls?.map((tc) =>
                    tc.name === chunk.tool_name
                      ? { ...tc, result: chunk.tool_result, status: 'completed' as const }
                      : tc
                  ),
                }
              : m
          )
        );
        break;

      case 'questions':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  questions: chunk.questions,
                  questionsContext: chunk.questions_context,
                }
              : m
          )
        );
        break;

      case 'error':
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: m.content + `\n\nエラー: ${chunk.content}` }
              : m
          )
        );
        break;
    }
  };

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setProcessedQuestionMessageIds(new Set());
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    messages,
    sessionId,
    isStreaming,
    sendMessage,
    clearMessages,
    stopStreaming,
    pendingQuestionsData,
    markQuestionsProcessed,
  };
}
