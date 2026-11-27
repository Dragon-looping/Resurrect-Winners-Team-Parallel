import { AuthUser } from '../types/inventory';
import { apiRequest } from './apiClient';

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

export interface AuthService {
  signIn(loginId: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

interface BackendLoginResponse {
  access_token?: string;
  token?: string;
  user?: {
    id?: number;
    login_id?: string;
    email?: string;
    display_name?: string;
    name?: string;
    role?: string;
    plant_id?: number;
    plant_name?: string;
    plant_location?: string;
  };
}

class BackendAuthService implements AuthService {
  async signIn(loginId: string, password: string): Promise<AuthResult> {
    const trimmedLogin = loginId.trim().toLowerCase();
    const result = await apiRequest<BackendLoginResponse>('/auth/login', {
      method: 'POST',
      body: { login_id: trimmedLogin, password },
    });

    if (!result.ok) {
      if (result.error.status === 404) {
        return {
          ok: false,
          error:
            'Authentication endpoint (POST /auth/login) is not available on the backend.',
        };
      }
      return {
        ok: false,
        error: result.error.message,
      };
    }

    const u = result.data.user;
    return {
      ok: true,
      user: {
        email: u?.login_id ?? u?.email ?? trimmedLogin,
        loginId: u?.login_id ?? trimmedLogin,
        name: u?.display_name ?? u?.name,
        role: u?.role ?? 'WAREHOUSE_USER',
        plantId: u?.plant_id,
        plantName: u?.plant_name,
        plantLocation: u?.plant_location,
        token: result.data.access_token ?? result.data.token,
        isDevMode: false,
      },
    };
  }

  async signOut(): Promise<void> {
    // Session cleared in AppContext / secureStorage
  }
}

export const authService: AuthService = new BackendAuthService();
