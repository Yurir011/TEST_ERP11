import { getToken } from "./auth";
import { logDebug, logError } from "./logger";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  logDebug("Api", `${method} ${path} 요청 시작`);
  const token = getToken();

  try {
    const res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const message = errBody?.detail ?? `HTTP ${res.status}`;
      throw new ApiError(res.status, typeof message === "string" ? message : JSON.stringify(message));
    }

    if (res.status === 204) {
      logDebug("Api", `${method} ${path} 성공 (No Content)`);
      return undefined as T;
    }

    const data = (await res.json()) as T;
    logDebug("Api", `${method} ${path} 성공`, data);
    return data;
  } catch (err) {
    logError("Api", `${method} ${path} 실패`, err);
    throw err;
  }
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
export const apiPut = <T>(path: string, body?: unknown) => request<T>("PUT", path, body);
export const apiDelete = <T = void>(path: string) => request<T>("DELETE", path);

export async function downloadFile(path: string, filename: string) {
  logDebug("Api", `파일 다운로드 시작: ${path}`);
  const token = getToken();
  try {
    const res = await fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new ApiError(res.status, `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    logDebug("Api", `파일 다운로드 성공: ${path}`);
  } catch (err) {
    logError("Api", `파일 다운로드 실패: ${path}`, err);
    throw err;
  }
}

export async function openFile(path: string) {
  logDebug("Api", `파일 열기 시작: ${path}`);
  const token = getToken();
  try {
    const res = await fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new ApiError(res.status, `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    logDebug("Api", `파일 열기 성공: ${path}`);
  } catch (err) {
    logError("Api", `파일 열기 실패: ${path}`, err);
    throw err;
  }
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  logDebug("Api", `파일 업로드 시작: ${path}`);
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(path, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const message = errBody?.detail ?? `HTTP ${res.status}`;
      throw new ApiError(res.status, typeof message === "string" ? message : JSON.stringify(message));
    }

    const data = (await res.json()) as T;
    logDebug("Api", `파일 업로드 성공: ${path}`, data);
    return data;
  } catch (err) {
    logError("Api", `파일 업로드 실패: ${path}`, err);
    throw err;
  }
}

export { ApiError };
