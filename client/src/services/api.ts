/**
 * Base API client.
 * Centralises fetch logic so every service call goes through one place.
 */

import { Config, DEFAULT_AGENT_ID } from '@/constants';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, timeout: customTimeout } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), customTimeout ?? Config.REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${Config.API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      // Try to parse the JSON error body returned by the Go backend.
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          errorMessage = errorBody.error;
          if (errorBody.message) {
            errorMessage += `: ${errorBody.message}`;
          }
        }
      } catch {
        // response wasn't JSON — keep the generic message
      }
      const err = new Error(errorMessage);
      (err as any).status = response.status;
      throw err;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Organic search result (web/research) */
export interface SourceItem {
  title: string;
  link: string;
  snippet?: string;
}

/** Place result (restaurants, businesses) */
export interface PlaceItem {
  title: string;
  address?: string;
  phone?: string;
  imageUrl?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  link?: string;
}

/** Image result */
export interface ImageItem {
  title: string;
  imageUrl: string;
  link?: string;
}

/** Research run metadata (partial, confidence, sub_queries). */
export interface ResearchMeta {
  partial?: boolean;
  confidence?: 'high' | 'low';
  sub_queries?: string[];
}

export interface ChatResponse {
  chat_id: string;
  content: string;
  /** Web search / research sources */
  sources?: SourceItem[];
  /** Web search places (restaurants, businesses) */
  places?: PlaceItem[];
  /** Web search images */
  images?: ImageItem[];
  /** Research-only metadata (partial, confidence, sub_queries) */
  research_meta?: ResearchMeta;
}

/** PDF upload result */
export interface PDFUploadResult {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  extracted_text: string;
}

export interface ChatListItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** Message extra payload (sources, places, images, research_meta). */
export interface MessageExtra {
  sources?: SourceItem[];
  places?: PlaceItem[];
  images?: ImageItem[];
  research_meta?: ResearchMeta;
}

export interface ChatMessageItem {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  extra?: MessageExtra;
}

export interface UpdateProfilePayload {
  name?: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
}

export const api = {
  get: <T>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'GET', headers }),

  post: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'POST', body, headers }),

  put: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'PUT', body, headers }),

  patch: <T>(endpoint: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'PATCH', body, headers }),

  delete: <T>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'DELETE', headers }),

  /** Profile management */
  updateProfile: (payload: UpdateProfilePayload, token: string) =>
    request<{ message: string }>('/profile', {
      method: 'PUT',
      body: payload,
      headers: { Authorization: `Bearer ${token}` },
    }),

  deleteProfile: (token: string) =>
    request<{ message: string }>('/profile', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }),

  /** Chat completion (requires auth). Pass chat_id when continuing. agentId defaults to GenZ Assistant. tools triggers web search or research. pdfContext and attachmentIds for PDF attachments. */
  chatComplete: (
    messages: ChatMessage[],
    chatId: string | null,
    token: string,
    agentId?: string | null,
    tools?: string[],
    pdfContext?: string,
    attachmentIds?: string[]
  ) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: {
        messages,
        chat_id: chatId || undefined,
        agent_id: agentId ?? DEFAULT_AGENT_ID,
        tools: tools ?? [],
        pdf_context: pdfContext || undefined,
        attachment_ids: attachmentIds ?? [],
      },
      headers: authHeaders(token),
      timeout: Config.CHAT_TIMEOUT,
    }),

  /** Research with progress stream (SSE). Calls onProgress for each step; resolves with ChatResponse on result. */
  chatCompleteResearchStream: async (
    messages: ChatMessage[],
    chatId: string | null,
    token: string,
    agentId: string,
    tools: string[],
    pdfContext: string | undefined,
    attachmentIds: string[] | undefined,
    onProgress: (data: { step: string; current?: number; total?: number; query?: string }) => void
  ): Promise<ChatResponse> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Config.CHAT_TIMEOUT);
    const url = `${Config.API_BASE_URL}/chat?stream_progress=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify({
        messages,
        chat_id: chatId || undefined,
        agent_id: agentId,
        tools,
        pdf_context: pdfContext,
        attachment_ids: attachmentIds ?? [],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error((errBody as { message?: string }).message || `API error: ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    const processBlock = (block: string): ChatResponse | null => {
      let eventType = '';
      let dataStr = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
      }
      if (!eventType || !dataStr) return null;
      const data = JSON.parse(dataStr) as Record<string, unknown>;
      if (eventType === 'progress') {
        onProgress({
          step: (data.step as string) ?? '',
          current: data.current as number | undefined,
          total: data.total as number | undefined,
          query: data.query as string | undefined,
        });
        return null;
      }
      if (eventType === 'result') return data as unknown as ChatResponse;
      if (eventType === 'error') {
        const err = data as { message?: string };
        throw new Error(err.message ?? 'Research failed');
      }
      return null;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          const result = processBlock(buffer);
          if (result) return result;
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const result = processBlock(block);
        if (result) return result;
      }
    }
    throw new Error('Stream ended without result');
  },

  /** Upload PDF for chat context. Returns extracted text and attachment metadata. */
  uploadPDF: async (uri: string, fileName: string, token: string, chatId?: string | null): Promise<PDFUploadResult> => {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: 'application/pdf',
    } as unknown as Blob);
    if (chatId) formData.append('chat_id', chatId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${Config.API_BASE_URL}/upload/pdf`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // Do not set Content-Type - fetch sets multipart/form-data with boundary
      } as Record<string, string>,
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      let errorMessage = `Upload failed: ${response.status}`;
      try {
        const err = await response.json();
        if (err?.message) errorMessage = err.message;
      } catch {
        //
      }
      throw new Error(errorMessage);
    }
    return response.json() as Promise<PDFUploadResult>;
  },

  /** List user's chats (requires auth) */
  getChats: (token: string) =>
    request<{ chats: ChatListItem[] }>('/chats', { method: 'GET', headers: authHeaders(token) }),

  /** Get messages for a chat (requires auth) */
  getChatMessages: (chatId: string, token: string) =>
    request<{ messages: ChatMessageItem[] }>(`/chats/${chatId}/messages`, { method: 'GET', headers: authHeaders(token) }),

  /** Chat completion with streaming (requires auth). Pass chat_id when continuing. agentId defaults to GenZ Assistant. */
  chatCompleteStream: async (
    messages: ChatMessage[],
    chatId: string | null,
    token: string,
    onChunk: (content: string) => void,
    onChatId: (id: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    agentId?: string | null,
  ): Promise<void> => {
    try {
      const response = await fetch(`${Config.API_BASE_URL}/chat?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({ messages, chat_id: chatId || undefined, agent_id: agentId ?? DEFAULT_AGENT_ID }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Stream not supported');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);

          if (data === '[DONE]') {
            onComplete();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.chat_id) onChatId(parsed.chat_id);
            if (parsed.content) onChunk(parsed.content);
            if (parsed.error) throw new Error(parsed.error);
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== 'Stream error') throw parseError;
            console.warn('Failed to parse SSE data:', data);
          }
        }
      }

      onComplete();
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  },
};
