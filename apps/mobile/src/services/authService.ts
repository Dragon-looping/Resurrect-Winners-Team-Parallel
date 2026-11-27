import { AuthUser } from '../types/inventory';
import { apiRequest } from './apiClient';

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
 * Production authentication remains unavailable until P2 adds POST /auth/login.
 * Does not invent credentials or fake successful authentication.
 */
class BackendAuthService implements AuthService {
  async signIn(email: string, password: string): Promise<AuthResult> {
    const result = await apiRequest<{
      access_token?: string;
      token?: string;
      user?: { email?: string; name?: string; role?: string };
    }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    if (!result.ok) {
      if (result.error.status === 404) {
        return {
          ok: false,
          error:
            'Authentication endpoint (POST /auth/login) is not yet available on the backend.',
        };
      }
      return {
        ok: false,
        error: result.error.message,
      };
    }

    return {
      ok: true,
      user: {
        email: result.data.user?.email ?? email,
        name: result.data.user?.name,
        role: result.data.user?.role ?? 'Warehouse Manager',
        token: result.data.access_token ?? result.data.token,
        isDevMode: false,
      },
    };
  }

  async signOut(): Promise<void> {
    // Session cleared in AppContext / AsyncStorage
  }
}

export const authService: AuthService = new BackendAuthService();
