import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser } from '../firebase';
import {
  checkUserAdminRole,
  createUserPreset,
  deleteUserPreset,
  fetchPresetById,
  subscribeAdminAllPresets,
  subscribeUserPresets,
  subscribeUserQuota,
  updateUserPreset,
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

interface PresetContextValue {
  user: User | null;
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
  signIn: () => Promise<User | null>;
  signOut: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [canListAllPresets, setCanListAllPresets] = useState(false);
  const [myPresets, setMyPresets] = useState<CardPresetRecord[]>([]);
  const [adminPresets, setAdminPresets] = useState<CardPresetRecord[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [presetQuotaCount, setPresetQuotaCount] = useState(0);
  const [loadingSharedLink, setLoadingSharedLink] = useState(false);
  const [activePreset, setActivePreset] = useState<CardPresetRecord | null>(null);
  const [sharedLinkError, setSharedLinkError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  // Default to custom domain rayyan29.eu.org when running on it; otherwise allow 1-click toggle
  const [shareOriginMode, setShareOriginMode] = useState<ShareOriginMode>(() => {
    if (typeof window !== 'undefined' && isCustomDomainHost(window.location.hostname)) {
      return 'custom';
    }
    return 'custom';
  });

  // Track Firebase Auth session readiness & admin role detection
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setIsAdmin(false);
        setCanListAllPresets(false);
        return;
      }
      void checkUserAdminRole(nextUser).then((status) => {
        if (!active) return;
        setIsAdmin(status.isAdmin);
        setCanListAllPresets(status.canListAll);
      });
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Subscribe to current signed-in user's personal presets & atomic quota counter
  useEffect(() => {
    if (!authReady || !user) {
      setMyPresets([]);
      setPresetQuotaCount(0);
      setPresetsError(null);
      return;
    }
    const unsubPresets = subscribeUserPresets(
      user.uid,
      (items) => {
        setMyPresets(items);
        setPresetsError(null);
      },
      () => {
        setPresetsError('Unable to load your saved presets.');
      }
    );
    const unsubQuota = subscribeUserQuota(user.uid, (count) => {
      setPresetQuotaCount(count);
    });
    return () => {
      unsubPresets();
      unsubQuota();
    };
  }, [authReady, user]);

  // Subscribe to all presets ONLY for bootstrapped admin moderation view
  useEffect(() => {
    if (!authReady || !user || !canListAllPresets) {
      setAdminPresets([]);
      setLoadingAdmin(false);
      return;
    }
    setLoadingAdmin(true);
    const unsub = subscribeAdminAllPresets(
      (items) => {
        setAdminPresets(items);
        setLoadingAdmin(false);
      },
      () => {
        setLoadingAdmin(false);
      }
    );
    return () => unsub();
  }, [authReady, user, canListAllPresets]);

  // Auto-load link-only shared preset when URL contains ?preset=<presetId>
  useEffect(() => {
    if (!authReady || typeof window === 'undefined') return;
    const requestedId = extractPresetIdFromSearch(window.location.search);
    if (!requestedId) return;

    let cancelled = false;
    setLoadingSharedLink(true);
    setSharedLinkError(null);

    fetchPresetById(requestedId)
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
  }, [authReady, user?.uid]);

  const signIn = useCallback(async (): Promise<User | null> => {
    setAuthBusy(true);
    try {
      const signedUser = await signInWithGoogle();
      return signedUser;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return null;
      }
      if (code === 'auth/unauthorized-domain') {
        throw new Error(
          'This domain is not yet allowlisted in Firebase Authentication → Settings → Authorized domains. Add rayyan29.eu.org there to enable Google Sign-In.'
        );
      }
      throw err;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthBusy(true);
    try {
      await signOutUser();
    } finally {
      setAuthBusy(false);
    }
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
        throw new Error('Paste a valid share link (e.g. https://rayyan29.eu.org/?preset=...) or preset ID.');
      }
      setLoadingSharedLink(true);
      setSharedLinkError(null);
      try {
        const preset = await fetchPresetById(presetId);
        if (!preset) {
          throw new Error('Preset not found, removed, or set to Private.');
        }
        loadPreset(preset, true);
        return preset;
      } finally {
        setLoadingSharedLink(false);
      }
    },
    [loadPreset]
  );

  const clearActivePreset = useCallback(() => {
    setActivePreset(null);
    setSharedLinkError(null);
    syncUrlPresetParam(null);
  }, []);

  const saveCurrentAsPreset = useCallback(
    async (params: SavePresetParams): Promise<CardPresetRecord> => {
      const { config, thumbnailDataUrl } = await snapshotCurrentStudioConfig();

      if (params.overwritePresetId) {
        await updateUserPreset(params.overwritePresetId, {
          title: params.title,
          description: params.description,
          isPublic: params.isPublic,
          thumbnailDataUrl,
          config,
        });
        const existing = myPresets.find((p) => p.id === params.overwritePresetId);
        const updated: CardPresetRecord = {
          id: params.overwritePresetId,
          title: params.title.trim(),
          description: params.description.trim(),
          ownerId: user?.uid || existing?.ownerId || '',
          authorName: existing?.authorName || user?.displayName || 'Studio Creator',
          isPublic: params.isPublic,
          thumbnailDataUrl,
          config,
          createdAtMs: existing?.createdAtMs || Date.now(),
          updatedAtMs: Date.now(),
        };
        setActivePreset(updated);
        syncUrlPresetParam(updated.id);
        return updated;
      }

      const created = await createUserPreset(
        {
          title: params.title,
          description: params.description,
          isPublic: params.isPublic,
          thumbnailDataUrl,
          config,
        },
        isAdmin
      );
      setActivePreset(created);
      syncUrlPresetParam(created.id);
      return created;
    },
    [isAdmin, myPresets, user]
  );

  const removePreset = useCallback(
    async (presetId: string, ownerId?: string) => {
      await deleteUserPreset(presetId, ownerId);
      if (activePreset?.id === presetId) {
        setActivePreset(null);
        syncUrlPresetParam(null);
      }
    },
    [activePreset?.id]
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

  const presetQuotaMax = isAdmin ? MAX_PRESETS_PER_ADMIN : MAX_PRESETS_PER_USER;

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
        signIn,
        signOut,
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
