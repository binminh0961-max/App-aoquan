// src/services/userPreferences.ts
/**
 * Lưu trữ cục bộ tùy chọn cá nhân (Tông da & Giới tính mặc định) trên thiết bị
 * bằng module native `expo-file-system` theo pattern 3 tầng
 * (FileSystem -> ExponentFileSystem -> Web localStorage + memory).
 */

import { requireOptionalNativeModule } from 'expo';
import { SilhouetteStyleType, SkinUndertone } from '../types/outfit';

export type { SkinUndertone, SilhouetteStyleType };

export interface UserPreferences {
  undertone: SkinUndertone;
  gender: SilhouetteStyleType;
}

const PREFS_FILE_NAME = 'user_preferences.json';
const WEB_STORAGE_KEY = 'app_aoquan_user_preferences_v1';

interface UserPreferencesPayload {
  undertone: SkinUndertone;
  gender?: SilhouetteStyleType;
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
let memoryGender: SilhouetteStyleType | null = null;

function isValidUndertone(value: unknown): value is SkinUndertone {
  return value === 'neutral' || value === 'warm' || value === 'cool';
}

function isValidGender(value: unknown): value is SilhouetteStyleType {
  return value === 'male' || value === 'female';
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

function parsePreferencesFromJson(
  raw: string
): Partial<UserPreferences> | null {
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferencesPayload> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const out: Partial<UserPreferences> = {};
    if (isValidUndertone(parsed.undertone)) {
      out.undertone = parsed.undertone;
    }
    if (isValidGender(parsed.gender)) {
      out.gender = parsed.gender;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function getWebLocalStorage(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
} | null {
  try {
    const g = globalThis as unknown as {
      localStorage?: {
        getItem(k: string): string | null;
        setItem(k: string, v: string): void;
      };
    };
    return g?.localStorage ?? null;
  } catch {
    return null;
  }
}

async function persistPreferencesPayload(payload: UserPreferencesPayload): Promise<void> {
  const serialized = JSON.stringify(payload);

  // 1. Modern Expo SDK 58 NativeModule ('FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${PREFS_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      await file.write(serialized);
      return;
    }
  } catch {
    // Fallback bên dưới
  }

  // 2. Legacy NativeModule ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.writeAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${PREFS_FILE_NAME}`;
      await legacyFs.writeAsStringAsync(fileUri, serialized, {});
      return;
    }
  } catch {
    // Fallback bên dưới
  }

  // 3. Web localStorage
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.setItem(WEB_STORAGE_KEY, serialized);
    }
  } catch {
    // Đã giữ sẵn trong memory, không crash
  }
}

async function readRawPreferencesFromDisk(): Promise<Partial<UserPreferences> | null> {
  // 1. Modern Expo SDK 58 NativeModule ('FileSystem')
  try {
    const modernFs = getModernNativeFS();
    if (modernFs?.documentDirectory && modernFs.FileSystemFile) {
      const fileUri = `${normalizeDirUri(modernFs.documentDirectory)}${PREFS_FILE_NAME}`;
      const file = new modernFs.FileSystemFile(fileUri);
      if (file.exists) {
        const raw = await file.text();
        return parsePreferencesFromJson(raw);
      }
      return null;
    }
  } catch {
    // Fallback xuống legacy
  }

  // 2. Legacy NativeModule ('ExponentFileSystem')
  try {
    const legacyFs = getLegacyNativeFS();
    if (legacyFs?.documentDirectory && legacyFs.readAsStringAsync) {
      const fileUri = `${normalizeDirUri(legacyFs.documentDirectory)}${PREFS_FILE_NAME}`;
      const raw = await legacyFs.readAsStringAsync(fileUri, {});
      return parsePreferencesFromJson(raw);
    }
  } catch {
    // Bỏ qua an toàn
  }

  // 3. Web localStorage
  try {
    const storage = getWebLocalStorage();
    if (storage) {
      const raw = storage.getItem(WEB_STORAGE_KEY);
      if (raw) {
        return parsePreferencesFromJson(raw);
      }
    }
  } catch {
    // Bỏ qua an toàn
  }

  return null;
}

/** Trả về giá trị tông da trong bộ nhớ đệm hiện tại (mặc định 'neutral' nếu chưa nạp). */
export function getCachedUserUndertone(): SkinUndertone {
  return memoryUndertone ?? 'neutral';
}

/** Trả về giới tính mặc định trong bộ nhớ đệm hiện tại (mặc định 'male' nếu chưa nạp). */
export function getCachedUserGender(): SilhouetteStyleType {
  return memoryGender ?? 'male';
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

/** Đọc đầy đủ tùy chọn người dùng (Tông da + Giới tính mặc định) từ thiết bị. */
export async function loadUserPreferences(): Promise<UserPreferences> {
  const fromDisk = await readRawPreferencesFromDisk();
  if (fromDisk?.undertone) {
    memoryUndertone = fromDisk.undertone;
  }
  if (fromDisk?.gender) {
    memoryGender = fromDisk.gender;
  }
  return {
    undertone: memoryUndertone ?? 'neutral',
    gender: memoryGender ?? 'male',
  };
}

/**
 * Đọc Tông da đã lưu của người dùng từ file `user_preferences.json`.
 * Trả về `null` nếu người dùng chưa từng chọn hoặc đọc file gặp lỗi.
 */
export async function loadUserUndertone(): Promise<SkinUndertone | null> {
  const fromDisk = await readRawPreferencesFromDisk();
  if (fromDisk?.gender) {
    memoryGender = fromDisk.gender;
  }
  if (fromDisk?.undertone) {
    memoryUndertone = fromDisk.undertone;
    return fromDisk.undertone;
  }
  return memoryUndertone;
}

/** Lưu Tông da mặc định (bảo toàn Giới tính mặc định đã lưu). */
export async function saveUserUndertone(undertone: SkinUndertone): Promise<void> {
  if (!isValidUndertone(undertone)) return;
  memoryUndertone = undertone;
  await persistPreferencesPayload({
    undertone,
    gender: memoryGender ?? 'male',
    updatedAt: Date.now(),
  });
}

/** Lưu Giới tính mặc định (bảo toàn Tông da đã lưu). */
export async function saveUserGender(gender: SilhouetteStyleType): Promise<void> {
  if (!isValidGender(gender)) return;
  memoryGender = gender;
  await persistPreferencesPayload({
    undertone: memoryUndertone ?? 'neutral',
    gender,
    updatedAt: Date.now(),
  });
}

/** Lưu đồng thời Tông da &/hoặc Giới tính mặc định. */
export async function saveUserPreferences(
  partial: Partial<UserPreferences>
): Promise<UserPreferences> {
  if (partial.undertone && isValidUndertone(partial.undertone)) {
    memoryUndertone = partial.undertone;
  }
  if (partial.gender && isValidGender(partial.gender)) {
    memoryGender = partial.gender;
  }
  const next: UserPreferences = {
    undertone: memoryUndertone ?? 'neutral',
    gender: memoryGender ?? 'male',
  };
  await persistPreferencesPayload({
    ...next,
    updatedAt: Date.now(),
  });
  return next;
}
