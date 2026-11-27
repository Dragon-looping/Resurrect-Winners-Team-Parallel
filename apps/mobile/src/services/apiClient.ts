import { getApiBaseUrl } from './config';

export type ApiErrorKind =
  | 'not_configured'
  | 'network'
  | 'timeout'
  | 'quarantined'
  | 'unauthorized'
  | 'http';

export interface ApiError {
  kind: ApiErrorKind;
  status?: number;
  message: string;
  reason?: string;
  quarantinedEventId?: number;
  details?: unknown;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; error: ApiError };

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 8000;
let loggedResolvedBaseUrl: string | null = null;

function isDevDiagnosticsEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function formatErrorSummary(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

function parseFastApiError(status: number, body: unknown): ApiError {
  if (status === 401 || status === 403) {
    return {
      kind: 'unauthorized',
      status,
      message: 'Incorrect email or password. Verify your credentials and try again.',
    };
  }

  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;

    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const obj = detail as {
        error?: string;
        reason?: string;
        quarantined_event_id?: number;
        details?: unknown;
      };
      const isQuarantined =
        status === 422 || typeof obj.quarantined_event_id === 'number';
      const reason = obj.reason ?? obj.error ?? `Request rejected (HTTP ${status}).`;
      return {
        kind: isQuarantined ? 'quarantined' : 'http',
        status,
        message: reason,
        reason: obj.reason ?? obj.error,
        quarantinedEventId: obj.quarantined_event_id,
        details: obj.details,
      };
    }

    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const msg = first?.msg ? String(first.msg) : `Validation failed (HTTP ${status}).`;
      return {
        kind: status === 422 ? 'quarantined' : 'http',
        status,
        message: msg,
        reason: msg,
        details: detail,
      };
    }

    if (typeof detail === 'string') {
      return {
        kind: status === 422 ? 'quarantined' : 'http',
        status,
        message: detail,
        reason: detail,
      };
    }
  }

  return {
    kind: 'http',
    status,
    message: `Backend returned HTTP ${status}.`,
  };
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  const baseUrl = getApiBaseUrl();
  const method = options.method ?? 'GET';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const requestUrl = `${baseUrl}${normalizedPath}`;

  if (isDevDiagnosticsEnabled() && loggedResolvedBaseUrl !== baseUrl) {
    loggedResolvedBaseUrl = baseUrl;
    console.info(`[apiClient] Resolved API base URL: ${baseUrl || '(empty)'}`);
  }

  if (!baseUrl) {
    if (isDevDiagnosticsEnabled()) {
      console.warn(`[apiClient] ${method} ${normalizedPath} aborted: EXPO_PUBLIC_API_BASE_URL is empty`);
    }
    return {
      ok: false,
      error: {
        kind: 'not_configured',
        message:
          'EXPO_PUBLIC_API_BASE_URL is not configured. Set it to the FastAPI backend URL.',
      },
    };
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const response = await fetch(requestUrl, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: unknown = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = rawText;
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        error: parseFastApiError(response.status, parsed),
      };
    }

    return {
      ok: true,
      status: response.status,
      data: parsed as T,
    };
  } catch (err) {
    if (isDevDiagnosticsEnabled()) {
      console.warn(
        `[apiClient] Request failed (${method} ${requestUrl}) [baseUrl=${baseUrl}]: ${formatErrorSummary(err)}`
      );
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        error: {
          kind: 'timeout',
          status: 504,
          message: 'Request timed out. Check network connectivity.',
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: 'network',
        message: 'Network unreachable. Verify EXPO_PUBLIC_API_BASE_URL and connectivity.',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type DevDiagnosticClassification =
  | 'SUCCESS'
  | 'NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'NATIVE_IOS_NETWORK_FAILURE'
  | 'DNS_OR_NETWORK_FAILURE'
  | 'HTTP_401'
  | 'HTTP_403'
  | 'HTTP_404'
  | 'HTTP_422'
  | 'HTTP_500'
  | 'HTTP_ERROR'
  | 'INVALID_JSON'
  | 'SCHEMA_MISMATCH';

export interface DevEndpointDiagnosticResult {
  endpointKey: 'health' | 'stock' | 'events' | 'feeds';
  resolvedBaseUrl: string;
  requestUrl: string;
  method: 'GET';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: number | null;
  classification: DevDiagnosticClassification;
  responseBodyPreview: string | null;
  nativeErrorName: string | null;
  nativeErrorMessage: string | null;
}

function validateDiagnosticSchema(
  endpointKey: DevEndpointDiagnosticResult['endpointKey'],
  parsed: unknown
): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const obj = parsed as Record<string, unknown>;
  switch (endpointKey) {
    case 'health':
      return typeof obj.status === 'string';
    case 'stock':
      return typeof obj.count === 'number' && Array.isArray(obj.items);
    case 'events':
      return typeof obj.total === 'number' && Array.isArray(obj.items);
    case 'feeds':
      return Array.isArray(obj.feeds);
  }
}

export async function runDevEndpointDiagnostic(
  endpointKey: DevEndpointDiagnosticResult['endpointKey'],
  path: string
): Promise<DevEndpointDiagnosticResult> {
  const resolvedBaseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const requestUrl = `${resolvedBaseUrl}${normalizedPath}`;
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();

  if (!isDevDiagnosticsEnabled()) {
    return {
      endpointKey,
      resolvedBaseUrl,
      requestUrl,
      method: 'GET',
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      status: null,
      classification: 'NOT_CONFIGURED',
      responseBodyPreview: 'Diagnostics disabled outside __DEV__.',
      nativeErrorName: null,
      nativeErrorMessage: null,
    };
  }

  if (!resolvedBaseUrl) {
    const completedAt = new Date().toISOString();
    return {
      endpointKey,
      resolvedBaseUrl: '(empty)',
      requestUrl: normalizedPath,
      method: 'GET',
      startedAt,
      completedAt,
      durationMs: Date.now() - startedMs,
      status: null,
      classification: 'NOT_CONFIGURED',
      responseBodyPreview: null,
      nativeErrorName: 'ConfigError',
      nativeErrorMessage: 'EXPO_PUBLIC_API_BASE_URL is empty.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const rawText = await response.text();
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    const responseBodyPreview =
      rawText.length > 360 ? `${rawText.slice(0, 360)}...` : rawText || '(empty body)';

    if (!response.ok) {
      const classification: DevDiagnosticClassification =
        response.status === 401
          ? 'HTTP_401'
          : response.status === 403
            ? 'HTTP_403'
            : response.status === 404
              ? 'HTTP_404'
              : response.status === 422
                ? 'HTTP_422'
                : response.status >= 500
                  ? 'HTTP_500'
                  : 'HTTP_ERROR';
      return {
        endpointKey,
        resolvedBaseUrl,
        requestUrl,
        method: 'GET',
        startedAt,
        completedAt,
        durationMs,
        status: response.status,
        classification,
        responseBodyPreview,
        nativeErrorName: null,
        nativeErrorMessage: null,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        endpointKey,
        resolvedBaseUrl,
        requestUrl,
        method: 'GET',
        startedAt,
        completedAt,
        durationMs,
        status: response.status,
        classification: 'INVALID_JSON',
        responseBodyPreview,
        nativeErrorName: null,
        nativeErrorMessage: null,
      };
    }

    const schemaValid = validateDiagnosticSchema(endpointKey, parsed);
    return {
      endpointKey,
      resolvedBaseUrl,
      requestUrl,
      method: 'GET',
      startedAt,
      completedAt,
      durationMs,
      status: response.status,
      classification: schemaValid ? 'SUCCESS' : 'SCHEMA_MISMATCH',
      responseBodyPreview,
      nativeErrorName: null,
      nativeErrorMessage: null,
    };
  } catch (err) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    const errorName = err instanceof Error ? err.name : typeof err;
    const errorMessage = err instanceof Error ? err.message : String(err);

    let classification: DevDiagnosticClassification = 'DNS_OR_NETWORK_FAILURE';
    if (errorName === 'AbortError') {
      classification = 'TIMEOUT';
    } else if (/network request failed|nsurl|ats|local network/i.test(errorMessage)) {
      classification = 'NATIVE_IOS_NETWORK_FAILURE';
    }

    return {
      endpointKey,
      resolvedBaseUrl,
      requestUrl,
      method: 'GET',
      startedAt,
      completedAt,
      durationMs,
      status: null,
      classification,
      responseBodyPreview: null,
      nativeErrorName: errorName,
      nativeErrorMessage: errorMessage,
    };
  } finally {
    clearTimeout(timeout);
  }
}
