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
  agent_id?: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AgentItem {
  id: string;
  name: string;
  description: string;
  instruction: string;
  icon_name: string;
  skill_ids?: string[];
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

  /** Chat completion (requires auth). Pass chat_id when continuing. agentId defaults to GenZ Assistant. Backend decides skills from agent config. tools override for explicit research. pdfContext and attachmentIds for PDF attachments. */
  chatComplete: (
    messages: ChatMessage[],
    chatId: string | null,
    token: string,
    agentId?: string | null,
    tools?: string[],
    pdfContext?: string,
    attachmentIds?: string[],
    streamProgress?: boolean
  ) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: {
        messages,
        chat_id: chatId || undefined,
        agent_id: agentId ?? DEFAULT_AGENT_ID,
        tools: tools ?? [],
        stream_progress: streamProgress ?? false,
        pdf_context: pdfContext || undefined,
        attachment_ids: attachmentIds ?? [],
      },
      headers: authHeaders(token),
      timeout: Config.CHAT_TIMEOUT,
    }),

  /** Research with SSE progress. Calls onProgress for each step, onResult with final ChatResponse, or onError. */
  chatCompleteResearchStream: async (
    messages: ChatMessage[],
    chatId: string | null,
    token: string,
    agentId: string,
    onProgress: (event: { step: string; detail?: { current?: number; total?: number; query?: string } }) => void,
    onResult: (data: ChatResponse) => void,
    onError: (err: Error) => void,
    pdfContext?: string,
    attachmentIds?: string[]
  ): Promise<void> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Config.CHAT_TIMEOUT);
    try {
      const res = await fetch(`${Config.API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({
          messages,
          chat_id: chatId || undefined,
          agent_id: agentId,
          tools: ['research'],
          stream_progress: true,
          pdf_context: pdfContext || undefined,
          attachment_ids: attachmentIds ?? [],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const errBody = await res.text();
        let msg = `API error: ${res.status}`;
        try {
          const j = JSON.parse(errBody);
          if (j?.message) msg = j.message;
        } catch {
          //
        }
        onError(new Error(msg));
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        onError(new Error('Streaming not supported'));
        return;
      }
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          let event = '';
          let data = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7).trim();
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!data) continue;
          if (event === 'progress') {
            try {
              const parsed = JSON.parse(data) as { step: string; detail?: { current?: number; total?: number; query?: string } };
              onProgress(parsed);
            } catch {
              //
            }
          } else if (event === 'result') {
            try {
              const parsed = JSON.parse(data) as ChatResponse;
              onResult(parsed);
            } catch (e) {
              onError(e instanceof Error ? e : new Error(String(e)));
            }
            return;
          } else if (event === 'error') {
            try {
              const parsed = JSON.parse(data) as { message?: string };
              onError(new Error(parsed.message ?? 'Research failed'));
            } catch {
              onError(new Error('Research failed'));
            }
            return;
          }
        }
      }
    } catch (e) {
      clearTimeout(timeout);
      onError(e instanceof Error ? e : new Error(String(e)));
    }
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

  /** List user's chats (requires auth). Pass agentId to filter by agent. */
  getChats: (token: string, agentId?: string | null) =>
    request<{ chats: ChatListItem[] }>(
      agentId ? `/chats?agent_id=${encodeURIComponent(agentId)}` : '/chats',
      { method: 'GET', headers: authHeaders(token) }
    ),

  /** Custom agents CRUD */
  createAgent: (payload: { name: string; description?: string; instruction?: string; icon_name?: string; skill_ids?: string[] }, token: string) =>
    request<{ agent: AgentItem }>('/agents', {
      method: 'POST',
      body: payload,
      headers: authHeaders(token),
    }),
  listAgents: (token: string) =>
    request<{ agents: AgentItem[] }>('/agents', { method: 'GET', headers: authHeaders(token) }),
  getAgent: (id: string, token: string) =>
    request<{ agent: AgentItem }>(`/agents/${id}`, { method: 'GET', headers: authHeaders(token) }),
  updateAgent: (id: string, payload: Partial<{ name: string; description: string; instruction: string; icon_name: string; skill_ids: string[] }>, token: string) =>
    request<{ agent: AgentItem }>(`/agents/${id}`, {
      method: 'PUT',
      body: payload,
      headers: authHeaders(token),
    }),
  deleteAgent: (id: string, token: string) =>
    request<{ message: string }>(`/agents/${id}`, { method: 'DELETE', headers: authHeaders(token) }),

  /** Get messages for a chat (requires auth) */
  getChatMessages: (chatId: string, token: string) =>
    request<{ messages: ChatMessageItem[] }>(`/chats/${chatId}/messages`, { method: 'GET', headers: authHeaders(token) }),

  /** Delete a chat (requires auth) */
  deleteChat: (chatId: string, token: string) =>
    request<{ message: string }>(`/chats/${chatId}`, { method: 'DELETE', headers: authHeaders(token) }),

  /** Chat completion with streaming (requires auth). Uses XHR for React Native compatibility. onExtra called when sources/places/images from web search. */
  chatCompleteStream: (
    messages: ChatMessage[],
    chatId: string | null,
    token: string,
    onChunk: (content: string) => void,
    onChatId: (id: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    agentId?: string | null,
    pdfContext?: string,
    attachmentIds?: string[],
    onExtra?: (extra: { sources?: SourceItem[]; places?: PlaceItem[]; images?: ImageItem[] }) => void,
  ): void => {
    const url = `${Config.API_BASE_URL}/chat?stream=true`;
    const body = JSON.stringify({
      messages,
      chat_id: chatId || undefined,
      agent_id: agentId ?? DEFAULT_AGENT_ID,
      pdf_context: pdfContext || undefined,
      attachment_ids: attachmentIds ?? [],
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = Config.CHAT_TIMEOUT;
    xhr.responseType = 'text';

    let buffer = '';
    let processedLength = 0;

    const processChunk = () => {
      const text = xhr.responseText;
      if (!text || text.length <= processedLength) return;
      buffer += text.slice(processedLength);
      processedLength = text.length;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          onComplete();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.chat_id) onChatId(parsed.chat_id);
          if (parsed.content) onChunk(parsed.content);
          if (parsed.sources || parsed.places || parsed.images) {
            onExtra?.({
              sources: parsed.sources,
              places: parsed.places,
              images: parsed.images,
            });
          }
          if (parsed.error) throw new Error(parsed.error);
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          if (e instanceof Error && e.message !== 'Stream error') onError(e);
        }
      }
    };

    xhr.onprogress = processChunk;
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3) processChunk();
      if (xhr.readyState === 4) {
        processChunk();
        if (xhr.status >= 200 && xhr.status < 300) {
          onComplete();
        } else if (xhr.status !== 0) {
          let msg = `API error: ${xhr.status}`;
          try {
            const err = JSON.parse(xhr.responseText || '{}');
            if (err?.message) msg = err.message;
          } catch {
            //
          }
          onError(new Error(msg));
        }
      }
    };
    xhr.onerror = () => onError(new Error('Network error'));
    xhr.ontimeout = () => onError(new Error('Request timeout'));
    xhr.send(body);
  },
};
