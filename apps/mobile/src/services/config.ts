export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
  return url.replace(/\/+$/, '');
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl().length > 0;
}

export function isDevModeEnabled(): boolean {
  const isDevRuntime = typeof __DEV__ !== 'undefined' && __DEV__;
  const isEnvEnabled = process.env.EXPO_PUBLIC_ENABLE_DEV_MODE === 'true';
  return isDevRuntime || isEnvEnabled;
}
