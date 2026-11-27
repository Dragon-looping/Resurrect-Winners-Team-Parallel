import { AuthUser } from '../types/inventory';
import { getApiBaseUrl } from './config';

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

/**
 * AuthService implementation targeting P2's FastAPI backend.
 * Does not invent credentials or fake successful authentication.
 */
class BackendAuthService implements AuthService {
  async signIn(email: string, password: string): Promise<AuthResult> {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      return {
        ok: false,
        error:
          'EXPO_PUBLIC_API_BASE_URL is not configured. Set it to the FastAPI backend URL to sign in.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error:
            'Incorrect email or password. Verify your credentials and try again.',
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          error: `Authentication service returned HTTP ${response.status}.`,
        };
      }

      const data = (await response.json()) as {
        access_token?: string;
        token?: string;
        user?: { email?: string; name?: string; role?: string };
      };

      return {
        ok: true,
        user: {
          email: data.user?.email ?? email,
          name: data.user?.name,
          role: data.user?.role ?? 'Warehouse Manager',
          token: data.access_token ?? data.token,
        },
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          ok: false,
          error: 'Authentication request timed out. Check network connectivity.',
        };
      }
      return {
        ok: false,
        error:
          'Unable to reach authentication server. Verify EXPO_PUBLIC_API_BASE_URL and connectivity.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async signOut(): Promise<void> {
    // Session cleared in AppContext / AsyncStorage
  }
}

export const authService: AuthService = new BackendAuthService();
