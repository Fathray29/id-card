import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserPreset,
  deleteUserPreset,
  fetchAdminPresets,
  fetchMyPresets,
  fetchPresetById,
  loginWithEmail,
  registerWithEmail,
  updateUserPreset,
  type AuthUser,
} from '../services/presetService';
import { useStudioStore } from '../store/useStudioStore';
import {
  MAX_PRESETS_PER_ADMIN,
  MAX_PRESETS_PER_USER,
  buildPresetShareUrl,
  extractPresetIdFromInput,
  extractPresetIdFromSearch,
  generateFrontThumbnailDataUrl,
  isCustomDomainHost,
  resolveShareOrigin,
  serializeLayerForPreset,
  type CardPresetRecord,
  type ShareOriginMode,
  type StudioPresetConfigData,
} from '../utils/presetSerializer';

interface SavePresetParams {
  title: string;
  description: string;
  isPublic: boolean;
  overwritePresetId?: string;
}

interface RegisterParams {
  email: string;
  password: string;
  displayName: string;
}

interface LoginParams {
  email: string;
  password: string;
}

interface PresetContextValue {
  user: AuthUser | null;
  authReady: boolean;
  authBusy: boolean;
  isAdmin: boolean;
  canListAllPresets: boolean;
  myPresets: CardPresetRecord[];
  adminPresets: CardPresetRecord[];
  loadingAdmin: boolean;
  presetQuotaCount: number;
  presetQuotaMax: number;
  loadingSharedLink: boolean;
  activePreset: CardPresetRecord | null;
  sharedLinkError: string | null;
  presetsError: string | null;
  shareOriginMode: ShareOriginMode;
  setShareOriginMode: (mode: ShareOriginMode) => void;
  register: (params: RegisterParams) => Promise<AuthUser>;
  login: (params: LoginParams) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refreshPresets: () => Promise<void>;
  loadPreset: (preset: CardPresetRecord, closeMobileDrawer?: boolean) => void;
  loadPresetByLinkOrId: (rawInput: string) => Promise<CardPresetRecord | null>;
  clearActivePreset: () => void;
  saveCurrentAsPreset: (params: SavePresetParams) => Promise<CardPresetRecord>;
  removePreset: (presetId: string, ownerId?: string) => Promise<void>;
  getShareUrl: (presetId: string) => string;
}

const PresetContext = createContext<PresetContextValue | null>(null);

async function snapshotCurrentStudioConfig(): Promise<{
  config: StudioPresetConfigData;
  thumbnailDataUrl: string;
}> {
  const s = useStudioStore.getState();
  const [front, back, lanyard, thumbnailDataUrl] = await Promise.all([
    serializeLayerForPreset('front', s.layers.front),
    serializeLayerForPreset('back', s.layers.back),
    serializeLayerForPreset('lanyard', s.layers.lanyard),
    generateFrontThumbnailDataUrl(s.layers.front, s.activeTemplate),
  ]);

  return {
    thumbnailDataUrl,
    config: {
      activeTemplate: s.activeTemplate,
      cardFinish: s.cardFinish,
      cardCaseEnabled: s.cardCaseEnabled,
      cardCaseStyle: s.cardCaseStyle,
      edgePreset: s.edgePreset,
      hardwareFinish: s.hardwareFinish,
      hologramEnabled: s.hologramEnabled,
      hologramIntensity: Number(Math.max(0.2, Math.min(1.0, s.hologramIntensity)).toFixed(3)),
      studioBackdrop: s.studioBackdrop,
      showLanyard: s.showLanyard,
      front,
      back,
      lanyard,
    },
  };
}

function syncUrlPresetParam(presetId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (presetId) {
      url.searchParams.set('preset', presetId);
    } else {
      url.searchParams.delete('preset');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // Ignore history API errors inside restricted sandbox frames
  }
}

export function PresetProvider({ children }: { children: React.ReactNode }) {
  // Keep auth session token strictly in React memory (never persisted to localStorage)
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authReady] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);

  const [myPresets, setMyPresets] = useState<CardPresetRecord[]>([]);
  const [adminPresets, setAdminPresets] = useState<CardPresetRecord[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [presetQuotaCount, setPresetQuotaCount] = useState(0);
  const [presetQuotaMax, setPresetQuotaMax] = useState(MAX_PRESETS_PER_USER);
  const [loadingSharedLink, setLoadingSharedLink] = useState(false);
  const [activePreset, setActivePreset] = useState<CardPresetRecord | null>(null);
  const [sharedLinkError, setSharedLinkError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';
  const canListAllPresets = isAdmin;

  // Default to custom domain rayyan29.eu.org with 1-click toggle to current URL
  const [shareOriginMode, setShareOriginMode] = useState<ShareOriginMode>(() => {
    if (typeof window !== 'undefined' && isCustomDomainHost(window.location.hostname)) {
      return 'custom';
    }
    return 'custom';
  });

  const refreshPresets = useCallback(async () => {
    if (!authToken || !user) {
      setMyPresets([]);
      setAdminPresets([]);
      setPresetQuotaCount(0);
      setPresetQuotaMax(MAX_PRESETS_PER_USER);
      setPresetsError(null);
      return;
    }

    try {
      const mine = await fetchMyPresets(authToken);
      setMyPresets(mine.presets);
      setPresetQuotaCount(mine.quotaCount);
      setPresetQuotaMax(mine.quotaMax);
      setPresetsError(null);
    } catch (err) {
      setPresetsError(err instanceof Error ? err.message : 'Unable to load your saved presets.');
    }

    if (user.role === 'admin') {
      setLoadingAdmin(true);
      try {
        const all = await fetchAdminPresets(authToken);
        setAdminPresets(all);
      } catch {
        // Admin queue fetch failure is non-fatal for personal presets
      } finally {
        setLoadingAdmin(false);
      }
    } else {
      setAdminPresets([]);
      setLoadingAdmin(false);
    }
  }, [authToken, user]);

  // Load user presets & admin moderation queue whenever session changes
  useEffect(() => {
    void refreshPresets();
  }, [refreshPresets]);

  // Auto-load link-only shared preset when URL contains ?preset=<presetId>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const requestedId = extractPresetIdFromSearch(window.location.search);
    if (!requestedId) return;

    let cancelled = false;
    setLoadingSharedLink(true);
    setSharedLinkError(null);

    fetchPresetById(requestedId, authToken)
      .then((preset) => {
        if (cancelled) return;
        if (!preset) {
          setSharedLinkError('That shared ID card preset was not found or is private.');
          return;
        }
        useStudioStore.getState().applyPresetConfig(preset.config);
        setActivePreset(preset);
      })
      .catch(() => {
        if (cancelled) return;
        setSharedLinkError('Could not load shared preset. It may be private or unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSharedLink(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const register = useCallback(async (params: RegisterParams): Promise<AuthUser> => {
    setAuthBusy(true);
    try {
      const session = await registerWithEmail(params);
      setAuthToken(session.token);
      setUser(session.user);
      setPresetQuotaMax(
        session.user.role === 'admin' ? MAX_PRESETS_PER_ADMIN : MAX_PRESETS_PER_USER
      );
      setPresetsError(null);
      return session.user;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const login = useCallback(async (params: LoginParams): Promise<AuthUser> => {
    setAuthBusy(true);
    try {
      const session = await loginWithEmail(params);
      setAuthToken(session.token);
      setUser(session.user);
      setPresetQuotaMax(
        session.user.role === 'admin' ? MAX_PRESETS_PER_ADMIN : MAX_PRESETS_PER_USER
      );
      setPresetsError(null);
      return session.user;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    setMyPresets([]);
    setAdminPresets([]);
    setPresetQuotaCount(0);
    setPresetQuotaMax(MAX_PRESETS_PER_USER);
    setPresetsError(null);
  }, []);

  const loadPreset = useCallback((preset: CardPresetRecord, closeMobileDrawer = true) => {
    const store = useStudioStore.getState();
    store.applyPresetConfig(preset.config);
    if (closeMobileDrawer) {
      store.setMobileDrawerOpen(false);
    }
    setActivePreset(preset);
    setSharedLinkError(null);
    syncUrlPresetParam(preset.id);
  }, []);

  const loadPresetByLinkOrId = useCallback(
    async (rawInput: string): Promise<CardPresetRecord | null> => {
      const presetId = extractPresetIdFromInput(rawInput);
      if (!presetId) {
        throw new Error(
          'Paste a valid share link (e.g. https://rayyan29.eu.org/?preset=...) or preset ID.'
        );
      }
      setLoadingSharedLink(true);
      setSharedLinkError(null);
      try {
        const preset = await fetchPresetById(presetId, authToken);
        if (!preset) {
          throw new Error('Preset not found, removed, or set to Private.');
        }
        loadPreset(preset, true);
        return preset;
      } finally {
        setLoadingSharedLink(false);
      }
    },
    [authToken, loadPreset]
  );

  const clearActivePreset = useCallback(() => {
    setActivePreset(null);
    setSharedLinkError(null);
    syncUrlPresetParam(null);
  }, []);

  const saveCurrentAsPreset = useCallback(
    async (params: SavePresetParams): Promise<CardPresetRecord> => {
      if (!authToken || !user) {
        throw new Error('Please sign in with your email and password before saving presets.');
      }

      const { config, thumbnailDataUrl } = await snapshotCurrentStudioConfig();

      if (params.overwritePresetId) {
        const updated = await updateUserPreset(authToken, params.overwritePresetId, {
          title: params.title,
          description: params.description,
          isPublic: params.isPublic,
          thumbnailDataUrl,
          config,
        });
        setMyPresets((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        if (user.role === 'admin') {
          setAdminPresets((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }
        setActivePreset(updated);
        syncUrlPresetParam(updated.id);
        return updated;
      }

      const created = await createUserPreset(authToken, {
        title: params.title,
        description: params.description,
        isPublic: params.isPublic,
        thumbnailDataUrl,
        config,
      });

      setMyPresets((prev) => [created.preset, ...prev]);
      if (user.role === 'admin') {
        setAdminPresets((prev) => [created.preset, ...prev]);
      }
      setPresetQuotaCount(created.quotaCount);
      setPresetQuotaMax(created.quotaMax);
      setActivePreset(created.preset);
      syncUrlPresetParam(created.preset.id);
      return created.preset;
    },
    [authToken, user]
  );

  const removePreset = useCallback(
    async (presetId: string) => {
      if (!authToken || !user) {
        throw new Error('Sign in to delete presets.');
      }
      const res = await deleteUserPreset(authToken, presetId);
      setMyPresets((prev) => prev.filter((p) => p.id !== presetId));
      setAdminPresets((prev) => prev.filter((p) => p.id !== presetId));
      setPresetQuotaCount(res.quotaCount);
      if (activePreset?.id === presetId) {
        setActivePreset(null);
        syncUrlPresetParam(null);
      }
    },
    [activePreset?.id, authToken, user]
  );

  const getShareUrl = useCallback(
    (presetId: string) => {
      const currentOrigin =
        typeof window !== 'undefined' ? window.location.origin : 'https://rayyan29.eu.org';
      const targetOrigin = resolveShareOrigin(shareOriginMode, currentOrigin);
      const pathname =
        shareOriginMode === 'custom'
          ? '/'
          : typeof window !== 'undefined'
            ? window.location.pathname
            : '/';
      return buildPresetShareUrl(presetId, targetOrigin, pathname);
    },
    [shareOriginMode]
  );

  return (
    <PresetContext.Provider
      value={{
        user,
        authReady,
        authBusy,
        isAdmin,
        canListAllPresets,
        myPresets,
        adminPresets,
        loadingAdmin,
        presetQuotaCount,
        presetQuotaMax,
        loadingSharedLink,
        activePreset,
        sharedLinkError,
        presetsError,
        shareOriginMode,
        setShareOriginMode,
        register,
        login,
        signOut,
        refreshPresets,
        loadPreset,
        loadPresetByLinkOrId,
        clearActivePreset,
        saveCurrentAsPreset,
        removePreset,
        getShareUrl,
      }}
    >
      {children}
    </PresetContext.Provider>
  );
}

export function usePresets(): PresetContextValue {
  const ctx = useContext(PresetContext);
  if (!ctx) {
    throw new Error('usePresets must be used within PresetProvider');
  }
  return ctx;
}
