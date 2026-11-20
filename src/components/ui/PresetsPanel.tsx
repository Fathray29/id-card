import React, { useState } from 'react';
import {
  Check,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Share2,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { usePresets } from '../../context/PresetProvider';
import {
  CUSTOM_SHARE_DOMAIN,
  PRESET_LIMITS,
  type CardPresetRecord,
} from '../../utils/presetSerializer';

function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false);
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return Promise.resolve(ok);
  } catch {
    return Promise.resolve(false);
  }
}

export function PresetsPanel() {
  const {
    user,
    authBusy,
    isAdmin,
    canListAllPresets,
    myPresets,
    adminPresets,
    loadingAdmin,
    presetQuotaCount,
    presetQuotaMax,
    activePreset,
    presetsError,
    shareOriginMode,
    setShareOriginMode,
    signIn,
    signOut,
    loadPreset,
    loadPresetByLinkOrId,
    saveCurrentAsPreset,
    removePreset,
    getShareUrl,
  } = usePresets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedLink, setSavedLink] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTakedownId, setConfirmTakedownId] = useState<string | null>(null);

  const [linkInput, setLinkInput] = useState('');
  const [openingLink, setOpeningLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [galleryTab, setGalleryTab] = useState<'mine' | 'open-link' | 'moderation'>('mine');

  const activeQuotaCount = Math.max(presetQuotaCount, myPresets.length);
  const isAtQuotaCap = Boolean(user && activeQuotaCount >= presetQuotaMax);
  const quotaRatio = Math.min(100, Math.round((activeQuotaCount / Math.max(1, presetQuotaMax)) * 100));

  const handleCopyShareLink = async (presetId: string) => {
    const url = getShareUrl(presetId);
    await copyText(url);
    setCopiedId(presetId);
    window.setTimeout(() => {
      setCopiedId((curr) => (curr === presetId ? null : curr));
    }, 2200);
  };

  const handleSignIn = async () => {
    setFormError(null);
    try {
      await signIn();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  };

  const handleSave = async (
    e: React.FormEvent,
    overwriteId?: string,
    titleOverride?: string,
    descriptionOverride?: string
  ) => {
    e.preventDefault();
    setFormError(null);
    setSavedLink(null);

    const trimmedTitle = (titleOverride ?? title).trim();
    const trimmedDesc = (descriptionOverride ?? description).trim();
    if (!trimmedTitle) {
      setFormError('Give your ID card preset a title before saving.');
      return;
    }

    if (!overwriteId && isAtQuotaCap) {
      setFormError(
        `You have reached your ${presetQuotaMax}-preset limit. Delete an existing preset to save a new one.`
      );
      return;
    }

    setSaving(true);
    try {
      const saved = await saveCurrentAsPreset({
        title: trimmedTitle,
        description: trimmedDesc,
        isPublic,
        overwritePresetId: overwriteId,
      });
      const url = getShareUrl(saved.id);
      setSavedLink(url);
      await copyText(url);
      setCopiedId(saved.id);
      setTitle('');
      setDescription('');
      setGalleryTab('mine');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save preset.';
      setFormError(
        msg.includes('Quota exceeded')
          ? 'Daily database quota exceeded. Please try again tomorrow.'
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    if (!linkInput.trim()) {
      setLinkError('Paste a share link or preset ID to load it in 3D.');
      return;
    }
    setOpeningLink(true);
    try {
      await loadPresetByLinkOrId(linkInput);
      setLinkInput('');
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not load that preset link.');
    } finally {
      setOpeningLink(false);
    }
  };

  const handleDelete = async (preset: CardPresetRecord) => {
    setDeletingId(preset.id);
    setFormError(null);
    try {
      await removePreset(preset.id, preset.ownerId);
      setConfirmTakedownId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete preset.');
    } finally {
      setDeletingId(null);
    }
  };

  const canOverwriteActive = Boolean(user && activePreset && activePreset.ownerId === user.uid);

  const renderPresetCard = (preset: CardPresetRecord, isModerationView = false) => {
    const isLoaded = activePreset?.id === preset.id;
    const isOwner = Boolean(user && preset.ownerId === user.uid);
    const canDelete = isOwner || isAdmin;
    const isCopied = copiedId === preset.id;
    const needsConfirm = isModerationView && !isOwner;
    const isConfirming = confirmTakedownId === preset.id;

    return (
      <div
        key={preset.id}
        className={`rounded-xl border p-2.5 transition-colors flex gap-3 items-start ${
          isLoaded
            ? 'bg-indigo-600/15 border-indigo-400/50'
            : 'bg-[#0b0e14] border-white/10 hover:border-white/20'
        }`}
      >
        <button
          type="button"
          onClick={() => loadPreset(preset)}
          aria-label={`Load preset ${preset.title}`}
          className="w-11 h-[70px] rounded-md overflow-hidden border border-white/15 bg-zinc-950 shrink-0 flex items-center justify-center"
        >
          {preset.thumbnailDataUrl ? (
            <img
              src={preset.thumbnailDataUrl}
              alt={preset.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span
              className="w-full h-full block"
              style={{ backgroundColor: preset.config.front.backgroundColor }}
            />
          )}
        </button>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => loadPreset(preset)}
              className="text-left min-w-0"
            >
              <div className="text-xs font-semibold text-zinc-100 truncate">{preset.title}</div>
              <div className="text-[10px] text-zinc-400 truncate mt-0.5 flex items-center gap-1.5">
                <span>by {preset.authorName}</span>
                {preset.isPublic ? (
                  <span className="inline-flex items-center gap-0.5 text-emerald-300/90">
                    <Link2 className="w-2.5 h-2.5" /> Link-only
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-amber-300">
                    <Lock className="w-2.5 h-2.5" /> Private
                  </span>
                )}
                {preset.config.cardCaseEnabled && (
                  <span className="inline-flex items-center gap-0.5 text-indigo-300">
                    <Shield className="w-2.5 h-2.5" /> Case
                  </span>
                )}
              </div>
            </button>
          </div>

          {preset.description && (
            <p className="text-[11px] text-zinc-400 line-clamp-1">{preset.description}</p>
          )}

          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => loadPreset(preset)}
              className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold transition-colors ${
                isLoaded
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/10 hover:bg-white/15 text-zinc-100'
              }`}
            >
              {isLoaded ? 'Loaded' : isModerationView ? 'Inspect 3D' : 'Interact 3D'}
            </button>

            {preset.isPublic && (
              <button
                type="button"
                onClick={() => handleCopyShareLink(preset.id)}
                aria-label={`Copy share link for ${preset.title}`}
                className="min-h-[30px] px-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 text-[11px] text-zinc-200 inline-flex items-center gap-1 transition-colors"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Link2 className="w-3 h-3 text-indigo-300" />
                    Copy Link
                  </>
                )}
              </button>
            )}

            {canDelete && (
              needsConfirm ? (
                isConfirming ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(preset)}
                    disabled={deletingId === preset.id}
                    className="min-h-[30px] px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-semibold text-white inline-flex items-center gap-1 transition-colors ml-auto"
                  >
                    {deletingId === preset.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-3 h-3" />
                    )}
                    Confirm
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmTakedownId(preset.id)}
                    aria-label={`Take down preset ${preset.title}`}
                    className="min-h-[30px] px-2 rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-[11px] font-medium text-rose-300 inline-flex items-center gap-1 transition-colors ml-auto"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    Take Down
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => handleDelete(preset)}
                  disabled={deletingId === preset.id}
                  aria-label={`Delete preset ${preset.title}`}
                  className="min-h-[30px] px-2 rounded-lg text-[11px] text-rose-400 hover:bg-rose-500/15 inline-flex items-center transition-colors ml-auto"
                >
                  {deletingId === preset.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Creator Account & Save Current 3D Card Form */}
      <section className="rounded-xl bg-[#090b0f] border border-white/10 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-indigo-400" />
            Save &amp; Share Link-Only Preset
          </h2>
          {user && (
            <button
              type="button"
              onClick={signOut}
              disabled={authBusy}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-3 h-3" />
              Sign out
            </button>
          )}
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Shared presets are <strong className="text-zinc-200 font-medium">link-only</strong> (not
          publicly browsable). Send the link so anyone can spin and inspect your full 3D badge on
          any device.
        </p>

        {/* Share Link Domain Selector (rayyan29.eu.org vs Current URL) */}
        <div className="rounded-lg bg-zinc-950/70 border border-white/8 p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span className="flex items-center gap-1 font-medium text-zinc-300">
              <Globe className="w-3 h-3 text-indigo-400" />
              Share Link Domain
            </span>
            <span className="font-mono text-indigo-300">
              {shareOriginMode === 'custom' ? CUSTOM_SHARE_DOMAIN : 'Current URL'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setShareOriginMode('custom')}
              className={`min-h-[28px] rounded-md text-[11px] font-medium border transition-colors ${
                shareOriginMode === 'custom'
                  ? 'bg-indigo-600/20 border-indigo-400/50 text-indigo-200'
                  : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {CUSTOM_SHARE_DOMAIN}
            </button>
            <button
              type="button"
              onClick={() => setShareOriginMode('current')}
              className={`min-h-[28px] rounded-md text-[11px] font-medium border transition-colors ${
                shareOriginMode === 'current'
                  ? 'bg-indigo-600/20 border-indigo-400/50 text-indigo-200'
                  : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Current Preview URL
            </button>
          </div>
        </div>

        {!user ? (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={authBusy}
            className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-white transition-colors"
          >
            {authBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogIn className="w-3.5 h-3.5" />
            )}
            Sign in with Google to Save &amp; Share
          </button>
        ) : (
          <form onSubmit={(e) => handleSave(e)} className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">
                  <strong className="text-zinc-200 font-medium">
                    {user.displayName || 'Creator'}
                  </strong>
                </span>
                {isAdmin && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/35 text-[9px] font-semibold text-rose-300 uppercase tracking-wider shrink-0">
                    Admin
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-mono shrink-0 ${
                  isAtQuotaCap ? 'text-amber-300 font-semibold' : 'text-zinc-400'
                }`}
              >
                {activeQuotaCount} / {presetQuotaMax} slots
              </span>
            </div>

            {/* Per-user preset quota bar */}
            <div className="h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden border border-white/5">
              <div
                className={`h-full transition-all duration-300 ${
                  isAtQuotaCap ? 'bg-amber-400' : 'bg-indigo-500'
                }`}
                style={{ width: `${quotaRatio}%` }}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="preset-title-input" className="sr-only">
                Preset title
              </label>
              <input
                id="preset-title-input"
                type="text"
                maxLength={PRESET_LIMITS.titleMaxLength}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Preset title (e.g. Summit VIP Obsidian)"
                className="w-full rounded-lg bg-zinc-900 border border-white/15 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="preset-desc-input" className="sr-only">
                Short note (optional)
              </label>
              <input
                id="preset-desc-input"
                type="text"
                maxLength={PRESET_LIMITS.descriptionMaxLength}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short note (optional)"
                className="w-full rounded-lg bg-zinc-900 border border-white/15 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400"
              />
            </div>

            {/* Link-Only Share vs Private Draft Toggle */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                  isPublic
                    ? 'bg-indigo-600/20 border-indigo-400/50 text-indigo-200'
                    : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Link2 className="w-3 h-3" />
                Link-Only Share
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                  !isPublic
                    ? 'bg-amber-500/15 border-amber-400/45 text-amber-200'
                    : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Lock className="w-3 h-3" />
                Private Draft
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={saving || isAtQuotaCap}
                className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 text-xs font-semibold text-white transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {saving
                  ? 'Saving & Compressing...'
                  : isAtQuotaCap
                    ? `Limit Reached (${presetQuotaMax}/${presetQuotaMax})`
                    : 'Save & Copy Share Link'}
              </button>

              {canOverwriteActive && activePreset && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={(e) => {
                    const nextTitle = title.trim() || activePreset.title;
                    const nextDesc = description.trim() || activePreset.description;
                    void handleSave(e, activePreset.id, nextTitle, nextDesc);
                  }}
                  title="Update currently loaded preset with latest edits"
                  aria-label="Update loaded preset"
                  className="min-h-[40px] px-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200 inline-flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Update
                </button>
              )}
            </div>
          </form>
        )}

        {formError && (
          <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-2.5 py-2">
            {formError}
          </p>
        )}

        {savedLink && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-emerald-300">
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Preset saved &amp; link copied!
              </span>
              <button
                type="button"
                onClick={() => copyText(savedLink)}
                className="underline hover:text-emerald-200"
              >
                Copy again
              </button>
            </div>
            <p className="text-[10px] font-mono text-zinc-300 truncate">{savedLink}</p>
          </div>
        )}
      </section>

      {/* Tabs: My Presets | Open Link | Moderation (Admins Only) */}
      <section className="space-y-2.5">
        <div
          className={`grid gap-1 p-1 rounded-xl bg-[#090b0f] border border-white/10 ${
            isAdmin ? 'grid-cols-3' : 'grid-cols-2'
          }`}
        >
          <button
            type="button"
            onClick={() => setGalleryTab('mine')}
            className={`min-h-[34px] rounded-lg text-[11px] font-semibold transition-colors ${
              galleryTab === 'mine'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            My Presets ({myPresets.length})
          </button>
          <button
            type="button"
            onClick={() => setGalleryTab('open-link')}
            className={`min-h-[34px] rounded-lg text-[11px] font-semibold transition-colors ${
              galleryTab === 'open-link'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Open Link
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setGalleryTab('moderation')}
              className={`min-h-[34px] rounded-lg text-[11px] font-semibold transition-colors ${
                galleryTab === 'moderation'
                  ? 'bg-rose-600 text-white'
                  : 'text-rose-300/80 hover:text-rose-200'
              }`}
            >
              Moderation {canListAllPresets ? `(${adminPresets.length})` : ''}
            </button>
          )}
        </div>

        {presetsError && (
          <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-2">
            {presetsError}
          </p>
        )}

        {galleryTab === 'open-link' ? (
          <form
            onSubmit={handleOpenLink}
            className="rounded-xl bg-[#090b0f] border border-white/10 p-3.5 space-y-2.5"
          >
            <div className="space-y-1">
              <label htmlFor="open-preset-link-input" className="text-xs font-semibold text-zinc-200 block">
                Load Shared 3D Preset Link
              </label>
              <p className="text-[11px] text-zinc-400">
                Paste any <span className="font-mono text-zinc-300">{CUSTOM_SHARE_DOMAIN}/?preset=...</span> link or preset ID. Works without signing in.
              </p>
            </div>
            <input
              id="open-preset-link-input"
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder={`https://${CUSTOM_SHARE_DOMAIN}/?preset=badge_...`}
              className="w-full rounded-lg bg-zinc-900 border border-white/15 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400 font-mono"
            />
            <button
              type="submit"
              disabled={openingLink}
              className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 px-3 py-2 text-xs font-semibold text-zinc-100 transition-colors"
            >
              {openingLink ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              {openingLink ? 'Loading 3D Badge...' : 'Load Preset in 3D'}
            </button>
            {linkError && (
              <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-2.5 py-2">
                {linkError}
              </p>
            )}
          </form>
        ) : galleryTab === 'moderation' && isAdmin ? (
          canListAllPresets ? (
            loadingAdmin ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                Loading presets for moderation...
              </div>
            ) : adminPresets.length === 0 ? (
              <div className="rounded-xl bg-[#090b0f] border border-white/10 p-5 text-center space-y-1.5">
                <Shield className="w-5 h-5 text-emerald-400 mx-auto" />
                <p className="text-xs font-medium text-zinc-200">No presets in database</p>
                <p className="text-[11px] text-zinc-400">
                  Saved user presets will appear here for moderation and takedown.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {adminPresets.map((preset) => renderPresetCard(preset, true))}
              </div>
            )
          ) : (
            <div className="rounded-xl bg-[#090b0f] border border-white/10 p-4 space-y-2 text-[11px] text-zinc-300">
              <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                <ShieldAlert className="w-4 h-4" />
                Moderator Link Takedown Active
              </div>
              <p className="text-zinc-400">
                Open any reported share link via the <strong className="text-zinc-200">Open Link</strong> tab and click <strong className="text-rose-300">Take Down</strong> in the top banner to remove it.
              </p>
            </div>
          )
        ) : myPresets.length === 0 ? (
          <div className="rounded-xl bg-[#090b0f] border border-white/10 p-5 text-center space-y-1.5">
            <Sparkles className="w-5 h-5 text-indigo-400 mx-auto" />
            <p className="text-xs font-medium text-zinc-200">
              {user ? 'No saved presets yet' : 'Sign in to manage your presets'}
            </p>
            <p className="text-[11px] text-zinc-400">
              {user
                ? `You can save up to ${presetQuotaMax} link-shareable 3D ID card presets and open them on any device.`
                : 'Sign in above to save your own presets, or switch to Open Link to view a shared link.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {myPresets.map((preset) => renderPresetCard(preset, false))}
          </div>
        )}
      </section>
    </div>
  );
}
