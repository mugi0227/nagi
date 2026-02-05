import { api } from './client';
import { getAuthToken } from './auth';
import type { ChatRequest, ChatResponse, ChatSession, ChatHistoryMessage } from './types';

export interface StreamChunk {
  chunk_type: 'tool_start' | 'tool_end' | 'tool_error' | 'text' | 'done' | 'error' | 'proposal' | 'questions';
  tool_name?: string;
  tool_call_id?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string;
  error_message?: string;
  content?: string;
  assistant_message?: string;
  session_id?: string;
  capture_id?: string;
  // Proposal-specific fields
  proposal_id?: string;
  proposal_type?: 'create_task' | 'create_project' | 'create_skill' | 'assign_task' | 'phase_breakdown' | 'tool_action';
  description?: string;
  payload?: Record<string, unknown>;
  // Questions-specific fields (ask_user_questions tool)
  questions?: Array<{
    id: string;
    question: string;
    options: string[];
    allow_multiple: boolean;
  }>;
  context?: string;
}

export const chatApi = {
  sendMessage: (request: ChatRequest) =>
    api.post<ChatResponse>('/chat', request),
  listSessions: () =>
    api.get<ChatSession[]>('/chat/sessions'),
  getHistory: (sessionId: string) =>
    api.get<ChatHistoryMessage[]>(`/chat/history/${sessionId}`),

  /**
   * Stream chat response using Server-Sent Events
   * @param request Chat request parameters
   * @param signal Optional AbortSignal to cancel the request
   */
  async *streamMessage(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk, void, unknown> {
    // Use relative path (same as client.ts)
    const baseURL = import.meta.env.VITE_API_URL || '/api';
    const { token } = getAuthToken();

    const response = await fetch(`${baseURL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix
            if (data.trim()) {
              try {
                const chunk = JSON.parse(data) as StreamChunk;
                yield chunk;
              } catch (e) {
                console.error('Failed to parse SSE data:', data, e);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
