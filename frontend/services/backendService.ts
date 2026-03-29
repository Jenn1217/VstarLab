import { TableQueryParams, TableRow } from '../types';

// Configuration for your backend URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const queryTableData = async (params: TableQueryParams): Promise<TableRow[]> => {
  try {
    // Attempt to call the real backend
    // You need to wrap your run3.py in a server (e.g. FastAPI) that accepts these parameters
    const response = await fetch(`${API_BASE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('Backend not available');
    }

    return await response.json();
  } catch (error) {
    console.warn("Backend connection failed, using mock data for UI preview.", error);

    // MOCK DATA GENERATOR (Matches the db1 image structure)
    // This allows you to view the UI without the backend running
    return new Array(10).fill(null).map((_, i) => ({
      id: `row-${i}`,
      acct_num: 'deac1566-3c98-48e4-b93f-2344b37e5cc4',
      acg_dt: new Date(2025, 5, 9 - i).toUTCString().replace('GMT', 'GMT'), // Mock dates around June 2025
      ccy: '615',
      dt: `2025060${9 - i}`,
      gnl_ldgr_bal: '0.00',
      org_num: '11170666',
      sbact_acct_bal: i % 2 === 0 ? '8180.57' : '1.71',
      sbj_num: '0'
    }));
  }
};

// Function to send chat messages to your Python backend
export const sendBackendMessage = async function* (message: string, sessionId: string, model: string, functionMode: string | null, signal?: AbortSignal, userId?: string): AsyncGenerator<{ type: string, content: string }, void, unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, model, functionMode, userId }), // Pass userId here
      signal
    });

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          yield data;
        } catch (e) {
          console.warn("Failed to parse JSON line:", line);
        }
      }
    }
  } catch (error) {
    console.error("Backend chat error:", error);
    yield { type: 'content', content: "错误：无法连接到后端服务。请确保 run3.py 已作为 API 服务启动。" };
  }
};

// Login
export const login = async (jobId: string, password: string) => {
  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, password })
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error("INVALID_CREDENTIALS");
      throw new Error("SERVER_ERROR");
    }

    const data = await res.json();
    return data.user;
  } catch (e) {
    if (e instanceof Error && (e.message === "INVALID_CREDENTIALS" || e.message === "SERVER_ERROR")) {
      throw e;
    }
    throw new Error("NETWORK_ERROR");
  }
};

// History Management
export const fetchHistory = async (userId?: string) => {
  try {
    // Append userId query param if it exists
    const url = userId ? `${API_BASE_URL}/history?userId=${userId}` : `${API_BASE_URL}/history`;
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch history", e);
    return [];
  }
};

export const fetchSession = async (sessionId: string) => {
  try {
    const res = await fetch(`${API_BASE_URL}/history/${sessionId}`);
    if (!res.ok) throw new Error("Session not found");
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch session", e);
    return null;
  }
};

export const deleteSession = async (sessionId: string) => {
  await fetch(`${API_BASE_URL}/history/${sessionId}`, { method: 'DELETE' });
};

export const renameSession = async (sessionId: string, title: string) => {
  await fetch(`${API_BASE_URL}/history/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
};

// Knowledge Base Management

// KB Management (Enhanced)
export const fetchKBs = async (userId?: string) => {
  try {
    const url = userId ? `${API_BASE_URL}/kbs?userId=${userId}` : `${API_BASE_URL}/kbs`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch KBs");
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch KBs", e);
    return [];
  }
};

export const createKB = async (data: { title: string; description: string; visibility: string; userId: string }) => {
  const res = await fetch(`${API_BASE_URL}/kbs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Failed to create KB");
  return await res.json();
};

export const deleteKB = async (kbId: string, userId: string) => {
  const res = await fetch(`${API_BASE_URL}/kbs/${kbId}?userId=${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Failed to delete KB");
};

export const fetchKBFiles = async (kbId: string, userId?: string) => {
  try {
    const url = userId ? `${API_BASE_URL}/kb/${kbId}/files?userId=${userId}` : `${API_BASE_URL}/kb/${kbId}/files`;
    const res = await fetch(url);
    if (!res.ok) return []; // Fallback to empty if not found/error
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch KB files", e);
    return [];
  }
};

export const uploadKBFile = async (kbId: string, file: File, userId: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('userId', userId);

  const res = await fetch(`${API_BASE_URL}/kb/${kbId}/upload`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) throw new Error("Upload failed");
  return await res.json();
};

export const fetchKBFileContent = async (kbId: string, filename: string, userId?: string) => {
  try {
    let url = `${API_BASE_URL}/kb/${kbId}/file?filename=${encodeURIComponent(filename)}`;
    if (userId) {
      url += `&userId=${userId}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("File not found");
    const data = await res.json();
    return data.content;
  } catch (e) {
    console.error("Failed to fetch file content", e);
    return "无法读取文件内容";
  }
};

// Favorites Management
export const toggleFavorite = async (userId: string, itemId: string, itemType: 'kb' | 'message' | 'file' | 'session') => {
  const res = await fetch(`${API_BASE_URL}/favorites/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, itemId, itemType })
  });
  if (!res.ok) throw new Error("Failed to toggle favorite");
  return await res.json();
};

export const fetchFavorites = async (userId: string) => {
  try {
    const res = await fetch(`${API_BASE_URL}/favorites?userId=${userId}`);
    if (!res.ok) throw new Error("Failed to fetch favorites");
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch favorites", e);
    return { kbs: [], messages: [], files: [] };
  }
};
