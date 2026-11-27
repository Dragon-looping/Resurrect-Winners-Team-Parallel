import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const AUTH_USER_KEY = 'setuvyuha_auth_user_v1';

export async function saveAuthSession(serializedUser: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(AUTH_USER_KEY, serializedUser);
    return;
  }
  await SecureStore.setItemAsync(AUTH_USER_KEY, serializedUser);
}

export async function loadAuthSession(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(AUTH_USER_KEY);
  }
  return SecureStore.getItemAsync(AUTH_USER_KEY);
}

export async function clearAuthSession(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(AUTH_USER_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(AUTH_USER_KEY);
}
