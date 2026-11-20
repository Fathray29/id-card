import {
  PRESET_LIMITS,
  validatePresetMutationInput,
  type CardPresetRecord,
  type StudioPresetConfigData,
} from '../utils/presetValidation';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
}

export interface AuthSessionResponse {
  token: string;
  user: AuthUser;
}

export interface PresetMutationInput {
  title: string;
  description: string;
  isPublic: boolean;
  thumbnailDataUrl: string;
  config: StudioPresetConfigData;
}

export interface MyPresetsResponse {
  presets: CardPresetRecord[];
  quotaCount: number;
  quotaMax: number;
}

export interface CreatePresetResponse {
  preset: CardPresetRecord;
  quotaCount: number;
  quotaMax: number;
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    token?: string | null;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function registerWithEmail(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/register', {
    method: 'POST',
    body: {
      email: params.email.trim(),
      password: params.password,
      displayName: params.displayName.trim(),
    },
  });
}

export async function loginWithEmail(params: {
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: {
      email: params.email.trim(),
      password: params.password,
    },
  });
}

export async function fetchCurrentUser(token: string): Promise<AuthUser | null> {
  try {
    const res = await apiRequest<{ user: AuthUser }>('/api/auth/me', { token });
    return res.user;
  } catch {
    return null;
  }
}

export async function fetchPresetById(
  presetId: string,
  token?: string | null
): Promise<CardPresetRecord | null> {
  const cleanId = presetId.trim();
  if (
    !cleanId ||
    cleanId.length > PRESET_LIMITS.idMaxLength ||
    !PRESET_LIMITS.idPattern.test(cleanId)
  ) {
    return null;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api/presets/${encodeURIComponent(cleanId)}`, { headers });
  if (res.status === 404) {
    return null;
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : 'Unable to load preset.';
    throw new Error(errMsg);
  }
  return (data as { preset: CardPresetRecord }).preset;
}

export async function fetchMyPresets(token: string): Promise<MyPresetsResponse> {
  return apiRequest<MyPresetsResponse>('/api/presets/mine', { token });
}

export async function fetchAdminPresets(token: string): Promise<CardPresetRecord[]> {
  const res = await apiRequest<{ presets: CardPresetRecord[] }>('/api/presets/admin', { token });
  return res.presets;
}

export async function createUserPreset(
  token: string,
  input: PresetMutationInput
): Promise<CreatePresetResponse> {
  const normalized: PresetMutationInput = {
    title: input.title.trim().slice(0, PRESET_LIMITS.titleMaxLength),
    description: input.description.trim().slice(0, PRESET_LIMITS.descriptionMaxLength),
    isPublic: Boolean(input.isPublic),
    thumbnailDataUrl: input.thumbnailDataUrl || '',
    config: input.config,
  };

  const check = validatePresetMutationInput(normalized);
  if (!check.valid) {
    throw new Error(check.errors[0] || 'Invalid preset payload.');
  }

  return apiRequest<CreatePresetResponse>('/api/presets', {
    method: 'POST',
    token,
    body: normalized,
  });
}

export async function updateUserPreset(
  token: string,
  presetId: string,
  input: PresetMutationInput
): Promise<CardPresetRecord> {
  const normalized: PresetMutationInput = {
    title: input.title.trim().slice(0, PRESET_LIMITS.titleMaxLength),
    description: input.description.trim().slice(0, PRESET_LIMITS.descriptionMaxLength),
    isPublic: Boolean(input.isPublic),
    thumbnailDataUrl: input.thumbnailDataUrl || '',
    config: input.config,
  };

  const check = validatePresetMutationInput(normalized);
  if (!check.valid) {
    throw new Error(check.errors[0] || 'Invalid preset payload.');
  }

  const res = await apiRequest<{ preset: CardPresetRecord }>(
    `/api/presets/${encodeURIComponent(presetId)}`,
    {
      method: 'PUT',
      token,
      body: normalized,
    }
  );
  return res.preset;
}

export async function deleteUserPreset(
  token: string,
  presetId: string
): Promise<{ deleted: boolean; quotaCount: number }> {
  return apiRequest<{ deleted: boolean; quotaCount: number }>(
    `/api/presets/${encodeURIComponent(presetId)}`,
    {
      method: 'DELETE',
      token,
    }
  );
}
