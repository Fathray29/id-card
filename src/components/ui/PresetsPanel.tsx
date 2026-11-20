import React, { useState } from 'react';
import {
  Check,
  Copy,
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
  Sparkles,
  Trash2,
} from 'lucide-react';
import { usePresets } from '../../context/PresetProvider';
import { PRESET_LIMITS, type CardPresetRecord } from '../../utils/presetSerializer';

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
    publicPresets,
    myPresets,
    loadingPublic,
    activePreset,
    presetsError,
    signIn,
    signOut,
    loadPreset,
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
  const [galleryTab, setGalleryTab] = useState<'community' | 'mine'>('community');

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

  const handleSave = async (e: React.FormEvent, overwriteId?: string) => {
    e.preventDefault();
    setFormError(null);
    setSavedLink(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Give your ID card preset a title before saving.');
      return;
    }

    setSaving(true);
    try {
      const saved = await saveCurrentAsPreset({
        title: trimmedTitle,
        description: description.trim(),
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
      setFormError(msg.includes('Quota exceeded') ? 'Daily database quota exceeded. Please try again tomorrow.' : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (presetId: string) => {
    setDeletingId(presetId);
    try {
      await removePreset(presetId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete preset.');
    } finally {
      setDeletingId(null);
    }
  };

  const visibleList: CardPresetRecord[] = galleryTab === 'mine' ? myPresets : publicPresets;
  const canOverwriteActive = Boolean(user && activePreset && activePreset.ownerId === user.uid);

  return (
    <div className="space-y-4">
      {/* Creator Account & Save Current 3D Card Form */}
      <section className="rounded-xl bg-[#090b0f] border border-white/10 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-indigo-400" />
            Save & Share ID Preset
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
          Save your full 3D badge setup — front/back art, lanyard, case, finish &amp; hologram — and
          share a link so anyone can spin and interact with it on any device.
        </p>

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
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">
                Signed in as <strong className="text-zinc-200 font-medium">{user.displayName || 'Creator'}</strong>
              </span>
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

            {/* Public Shareable vs Private Draft Toggle */}
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
                <Globe className="w-3 h-3" />
                Public Share Link
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
                disabled={saving}
                className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 text-xs font-semibold text-white transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {saving ? 'Saving & Compressing...' : 'Save & Copy Share Link'}
              </button>

              {canOverwriteActive && activePreset && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={(e) => {
                    if (!title.trim()) setTitle(activePreset.title);
                    void handleSave(e, activePreset.id);
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

      {/* Gallery Filter Tabs: Community vs My Presets */}
      <section className="space-y-2.5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#090b0f] border border-white/10">
          <button
            type="button"
            onClick={() => setGalleryTab('community')}
            className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
              galleryTab === 'community'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Community ({publicPresets.length})
          </button>
          <button
            type="button"
            onClick={() => setGalleryTab('mine')}
            className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
              galleryTab === 'mine'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            My Presets ({myPresets.length})
          </button>
        </div>

        {presetsError && (
          <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-2">
            {presetsError}
          </p>
        )}

        {loadingPublic && galleryTab === 'community' ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            Loading shared presets...
          </div>
        ) : visibleList.length === 0 ? (
          <div className="rounded-xl bg-[#090b0f] border border-white/10 p-5 text-center space-y-1.5">
            <Sparkles className="w-5 h-5 text-indigo-400 mx-auto" />
            <p className="text-xs font-medium text-zinc-200">
              {galleryTab === 'mine'
                ? user
                  ? 'No saved presets yet'
                  : 'Sign in to see your saved presets'
                : 'No community presets yet'}
            </p>
            <p className="text-[11px] text-zinc-400">
              {galleryTab === 'mine'
                ? 'Customize your badge above and save it to access or share on any device.'
                : 'Be the first to publish a 3D ID card preset for others to interact with!'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleList.map((preset) => {
              const isLoaded = activePreset?.id === preset.id;
              const isOwner = Boolean(user && preset.ownerId === user.uid);
              const isCopied = copiedId === preset.id;

              return (
                <div
                  key={preset.id}
                  className={`rounded-xl border p-2.5 transition-colors flex gap-3 items-start ${
                    isLoaded
                      ? 'bg-indigo-600/15 border-indigo-400/50'
                      : 'bg-[#0b0e14] border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Front Card Thumbnail */}
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

                  {/* Preset Metadata & Actions */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => loadPreset(preset)}
                        className="text-left min-w-0"
                      >
                        <div className="text-xs font-semibold text-zinc-100 truncate">
                          {preset.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate mt-0.5 flex items-center gap-1.5">
                          <span>by {preset.authorName}</span>
                          {!preset.isPublic && (
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
                        {isLoaded ? 'Loaded' : 'Interact 3D'}
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
                              Share
                            </>
                          )}
                        </button>
                      )}

                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleDelete(preset.id)}
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
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
