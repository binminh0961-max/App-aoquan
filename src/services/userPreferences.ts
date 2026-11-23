// src/services/userPreferences.ts
/**
 * Lưu trữ cục bộ tùy chọn Tông da (SkinUndertone) trên thiết bị bằng module native
 * `expo-file-system` đã tích hợp sẵn trong bản build Expo SDK 58 (không cần cài thêm thư viện native).
 */

import { requireOptionalNativeModule } from 'expo';
import { SkinUndertone } from '../types/outfit';

export type { SkinUndertone };

const PREFS_FILE_NAME = 'user_preferences.json';
const WEB_STORAGE_KEY = 'app_aoquan_user_preferences_v1';

interface UserPreferencesPayload {
  undertone: SkinUndertone;
  updatedAt: number;
}

interface NativeFileSystemFileInstance {
  exists: boolean;
  text(): Promise<string>;
  write(content: string): Promise<void>;
}

interface NativeFileSystemModule {
  documentDirectory?: string | null;
  FileSystemFile?: new (uri: string) => NativeFileSystemFileInstance;
}

interface LegacyFileSystemModule {
  documentDirectory?: string | null;
  readAsStringAsync?: (fileUri: string, options?: Record<string, unknown>) => Promise<string>;
  writeAsStringAsync?: (
    fileUri: string,
    contents: string,
    options?: Record<string, unknown>
  ) => Promise<void>;
}

// Bộ nhớ đệm nhẹ trong phiên làm việc (fallback an toàn nếu môi trường không có FS)
let memoryUndertone: SkinUndertone | null = null;

function isValidUndertone(value: unknown): value is SkinUndertone {
  return value === 'neutral' || value === 'warm' || value === 'cool';
}

function normalizeDirUri(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

function getModernNativeFS(): NativeFileSystemModule | null {
  try {
    return requireOptionalNativeModule<NativeFileSystemModule>('FileSystem');
  } catch {
    return null;
  }
}

function getLegacyNativeFS(): LegacyFileSystemModule | null {
  try {
    return requireOptionalNativeModule<LegacyFileSystemModule>('ExponentFileSystem');
  } catch {
    return null;
  }
}

function parseUndertoneFromJson(raw: string): SkinUndertone | null {
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferencesPayload> | null;
    if (parsed && isValidUndertone(parsed.undertone)) {
      return parsed.undertone;
    }
    return null;
  } catch {
    return null;
  }
}

function getWebLocalStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try {
    const g = globalThis as unknown as {
      localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
    };
    return g?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Trả về giá trị tông da trong bộ nhớ đệm hiện tại (mặc định 'neutral' nếu chưa nạp). */
export function getCachedUserUndertone(): SkinUndertone {
  return memoryUndertone ?? 'neutral';
}

export function getUndertoneShortLabel(undertone: SkinUndertone): string {
  switch (undertone) {
    case 'warm':
      return 'Ấm';
    case 'cool':
      return 'Lạnh';
    default:
      return 'Trung tính';
  }
}

/**
 * Đọc Tông da đã lưu của người dùng từ file `user_preferences.json` trong thư mục document của app.
 * Trả về `null` nếu người dùng chưa từng chọn hoặc đọc file gặp lỗi.
 */
export async function loadUserUndertone(): Promise<SkinUndertone | null> {
  // 1. Ưu tiên API mới của expo-file-system (Expo SDK 58: NativeModule 'FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${PREFS_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      if (file.exists) {
        const raw = await file.text();
        const undertone = parseUndertoneFromJson(raw);
        if (undertone) {
          memoryUndertone = undertone;
          return undertone;
        }
      }
      return memoryUndertone;
    }
  } catch {
    // Fallback xuống legacy hoặc web/memory
  }

  // 2. Fallback API legacy của expo-file-system ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.readAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${PREFS_FILE_NAME}`;
      const raw = await legacyFs.readAsStringAsync(fileUri, {});
      const undertone = parseUndertoneFromJson(raw);
      if (undertone) {
        memoryUndertone = undertone;
        return undertone;
      }
    }
  } catch {
    // File chưa tồn tại hoặc không hỗ trợ -> bỏ qua an toàn
  }

  // 3. Fallback cho môi trường Web preview (localStorage)
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      const raw = storage.getItem(WEB_STORAGE_KEY);
      if (raw) {
        const undertone = parseUndertoneFromJson(raw);
        if (undertone) {
          memoryUndertone = undertone;
          return undertone;
        }
      }
    }
  } catch {
    // Bỏ qua an toàn
  }

  return memoryUndertone;
}

/**
 * Lưu Tông da của người dùng vào file JSON nhẹ (`user_preferences.json`) trong thư mục document của app.
 * Bọc try/catch toàn diện để không bao giờ gây crash ứng dụng.
 */
export async function saveUserUndertone(undertone: SkinUndertone): Promise<void> {
  if (!isValidUndertone(undertone)) return;

  memoryUndertone = undertone;
  const payload: UserPreferencesPayload = {
    undertone,
    updatedAt: Date.now(),
  };
  const serialized = JSON.stringify(payload);

  // 1. Ghi bằng API mới của expo-file-system (Expo SDK 58: NativeModule 'FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${PREFS_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      await file.write(serialized);
      return;
    }
  } catch {
    // Thử fallback bên dưới
  }

  // 2. Fallback API legacy của expo-file-system ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.writeAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${PREFS_FILE_NAME}`;
      await legacyFs.writeAsStringAsync(fileUri, serialized, {});
      return;
    }
  } catch {
    // Thử fallback bên dưới
  }

  // 3. Fallback cho môi trường Web preview
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.setItem(WEB_STORAGE_KEY, serialized);
    }
  } catch {
    // Đã giữ sẵn trong memoryUndertone, không crash
  }
}
