import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser } from '../firebase';
import {
  createUserPreset,
  deleteUserPreset,
  fetchPresetById,
  subscribePublicPresets,
  subscribeUserPresets,
  updateUserPreset,
} from '../services/presetService';
import { useStudioStore } from '../store/useStudioStore';
import {
  buildPresetShareUrl,
  extractPresetIdFromSearch,
  generateFrontThumbnailDataUrl,
  serializeLayerForPreset,
  type CardPresetRecord,
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
  publicPresets: CardPresetRecord[];
  myPresets: CardPresetRecord[];
  loadingPublic: boolean;
  loadingSharedLink: boolean;
  activePreset: CardPresetRecord | null;
  sharedLinkError: string | null;
  presetsError: string | null;
  signIn: () => Promise<User | null>;
  signOut: () => Promise<void>;
  loadPreset: (preset: CardPresetRecord, closeMobileDrawer?: boolean) => void;
  clearActivePreset: () => void;
  saveCurrentAsPreset: (params: SavePresetParams) => Promise<CardPresetRecord>;
  removePreset: (presetId: string) => Promise<void>;
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

  const [publicPresets, setPublicPresets] = useState<CardPresetRecord[]>([]);
  const [myPresets, setMyPresets] = useState<CardPresetRecord[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingSharedLink, setLoadingSharedLink] = useState(false);
  const [activePreset, setActivePreset] = useState<CardPresetRecord | null>(null);
  const [sharedLinkError, setSharedLinkError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  // Track Firebase Auth session readiness
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Subscribe to Community Public Presets once Firebase Auth initializes
  useEffect(() => {
    if (!authReady) return;
    setLoadingPublic(true);
    const unsub = subscribePublicPresets(
      (items) => {
        setPublicPresets(items);
        setLoadingPublic(false);
        setPresetsError(null);
      },
      () => {
        setLoadingPublic(false);
        setPresetsError('Unable to sync shared presets right now.');
      }
    );
    return () => unsub();
  }, [authReady]);

  // Subscribe to current signed-in user's personal presets (public + private)
  useEffect(() => {
    if (!authReady || !user) {
      setMyPresets([]);
      return;
    }
    const unsub = subscribeUserPresets(
      user.uid,
      (items) => {
        setMyPresets(items);
      },
      () => {
        setPresetsError('Unable to load your saved presets.');
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // Auto-load shared preset if URL contains ?preset=<presetId> (cross-device sharing!)
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

      const created = await createUserPreset({
        title: params.title,
        description: params.description,
        isPublic: params.isPublic,
        thumbnailDataUrl,
        config,
      });
      setActivePreset(created);
      syncUrlPresetParam(created.id);
      return created;
    },
    [myPresets, user]
  );

  const removePreset = useCallback(
    async (presetId: string) => {
      await deleteUserPreset(presetId);
      if (activePreset?.id === presetId) {
        setActivePreset(null);
        syncUrlPresetParam(null);
      }
    },
    [activePreset?.id]
  );

  const getShareUrl = useCallback((presetId: string) => {
    if (typeof window === 'undefined') return `?preset=${presetId}`;
    return buildPresetShareUrl(presetId, window.location.origin, window.location.pathname);
  }, []);

  return (
    <PresetContext.Provider
      value={{
        user,
        authReady,
        authBusy,
        publicPresets,
        myPresets,
        loadingPublic,
        loadingSharedLink,
        activePreset,
        sharedLinkError,
        presetsError,
        signIn,
        signOut,
        loadPreset,
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
