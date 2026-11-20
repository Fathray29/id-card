import { useState } from 'react';
import { Check, Link2, Loader2, ShieldAlert, X } from 'lucide-react';
import { usePresets } from '../../context/PresetProvider';

export function SharedPresetBanner() {
  const {
    user,
    isAdmin,
    activePreset,
    loadingSharedLink,
    sharedLinkError,
    clearActivePreset,
    removePreset,
    getShareUrl,
  } = usePresets();
  const [copied, setCopied] = useState(false);
  const [confirmingTakedown, setConfirmingTakedown] = useState(false);
  const [takingDown, setTakingDown] = useState(false);

  if (!loadingSharedLink && !activePreset && !sharedLinkError) {
    return null;
  }

  const handleCopy = async () => {
    if (!activePreset) return;
    const url = getShareUrl(activePreset.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleAdminTakedown = async () => {
    if (!activePreset) return;
    setTakingDown(true);
    try {
      await removePreset(activePreset.id, activePreset.ownerId);
      setConfirmingTakedown(false);
    } finally {
      setTakingDown(false);
    }
  };

  const showAdminTakedown = Boolean(
    isAdmin && activePreset && activePreset.ownerId !== user?.uid
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 lg:top-4 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2.5 max-w-lg px-3.5 py-2 rounded-xl bg-zinc-900/92 border border-white/12 shadow-xl text-xs">
        {loadingSharedLink ? (
          <span className="flex items-center gap-2 text-zinc-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            Loading shared 3D ID card preset...
          </span>
        ) : sharedLinkError ? (
          <>
            <span className="text-rose-300 truncate">{sharedLinkError}</span>
            <button
              type="button"
              onClick={clearActivePreset}
              aria-label="Dismiss preset error"
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : activePreset ? (
          <>
            <div className="min-w-0">
              <div className="font-semibold text-zinc-100 truncate">{activePreset.title}</div>
              <div className="text-[10px] text-zinc-400 truncate">
                Shared by {activePreset.authorName} · Drag or flip to inspect 3D
              </div>
            </div>
            {activePreset.isPublic && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy preset share link"
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/35 border border-indigo-400/40 text-[11px] font-semibold text-indigo-200 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Link2 className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            )}
            {showAdminTakedown && (
              confirmingTakedown ? (
                <button
                  type="button"
                  onClick={handleAdminTakedown}
                  disabled={takingDown}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-semibold text-white transition-colors"
                >
                  {takingDown ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  Confirm
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingTakedown(true)}
                  aria-label="Admin take down preset"
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-[11px] font-semibold text-rose-300 transition-colors"
                >
                  <ShieldAlert className="w-3 h-3" />
                  Take Down
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => {
                setConfirmingTakedown(false);
                clearActivePreset();
              }}
              aria-label="Dismiss shared preset banner"
              className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
