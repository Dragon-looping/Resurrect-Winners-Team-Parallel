import AsyncStorage from '@react-native-async-storage/async-storage';

const SEQUENCE_STORAGE_KEY = '@setuvyuha/source_sequence_v1';
const INITIAL_SEQUENCE = 100;

let memorySequence: number | null = null;

/**
 * Allocates and persists a strictly monotonic source_sequence >= 0 in AsyncStorage.
 * Retries reuse the event's already-assigned sourceSequence rather than calling this.
 */
export async function allocateNextSourceSequence(): Promise<number> {
  if (memorySequence === null) {
    try {
      const raw = await AsyncStorage.getItem(SEQUENCE_STORAGE_KEY);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      memorySequence = Number.isFinite(parsed) && parsed >= 0 ? parsed : INITIAL_SEQUENCE;
    } catch {
      memorySequence = INITIAL_SEQUENCE;
    }
  }

  const next = memorySequence + 1;
  memorySequence = next;
  await AsyncStorage.setItem(SEQUENCE_STORAGE_KEY, String(next)).catch(() => {});
  return next;
}
