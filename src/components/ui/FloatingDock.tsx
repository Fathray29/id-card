import { useMemo, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Eye,
  EyeOff,
  Film,
  FlipHorizontal2,
  RefreshCw,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { useStudioStore, type CameraPresetId } from '../../store/useStudioStore';
import { detectSoftwareWebGL } from '../../utils/webglDetect';

const CAMERA_BUTTONS: Array<{ id: CameraPresetId; keyHint: string; label: string }> = [
  { id: 'full', keyHint: '1', label: 'Full' },
  { id: 'front', keyHint: '2', label: 'Front' },
  { id: 'back', keyHint: '3', label: 'Back' },
  { id: 'macro', keyHint: '4', label: 'Macro' },
];

export function FloatingDock() {
  const [collapsed, setCollapsed] = useState(false);
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);

  const isFlipped = useStudioStore((s) => s.isFlipped);
  const toggleFlip = useStudioStore((s) => s.toggleFlip);
  const showLanyard = useStudioStore((s) => s.showLanyard);
  const toggleLanyard = useStudioStore((s) => s.toggleLanyard);
  const autoSpin = useStudioStore((s) => s.autoSpin);
  const toggleAutoSpin = useStudioStore((s) => s.toggleAutoSpin);
  const previewReel = useStudioStore((s) => s.previewReel);
  const togglePreviewReel = useStudioStore((s) => s.togglePreviewReel);
  const cameraPreset = useStudioStore((s) => s.cameraPreset);
  const setCameraPreset = useStudioStore((s) => s.setCameraPreset);
  const openExportModal = useStudioStore((s) => s.openExportModal);
  const setMobileDrawerOpen = useStudioStore((s) => s.setMobileDrawerOpen);

  const glassSurface = isSoftwareGl
    ? 'bg-zinc-900/95 border border-white/12'
    : 'bg-zinc-900/85 backdrop-blur-xl border border-white/10';

  return (
    <>
      {/* Mobile Compact Top Bar (< 1024px) — clean 2-slot header keeping viewport unobstructed */}
      <div className="lg:hidden pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 py-2.5">
        <div className="pointer-events-auto px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-white/10">
          <span className="text-sm font-semibold tracking-tight text-zinc-100 whitespace-nowrap">
            BadgeForge 3D
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openExportModal('video')}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 active:scale-[0.98] whitespace-nowrap transition-transform"
          >
            <Film className="w-3.5 h-3.5" />
            Render MP4
          </button>
        </div>
      </div>

      {/* Mobile Thumb-Zone Bottom Control Bar (< 1024px) */}
      <div className="lg:hidden pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-2 px-3">
        {/* Compact Camera Preset Row */}
        <div
          className={`pointer-events-auto flex items-center gap-1 p-1 rounded-xl shadow-lg ${glassSurface}`}
          role="group"
          aria-label="Mobile Camera Presets"
        >
          {CAMERA_BUTTONS.map((cam) => {
            const active = cameraPreset === cam.id && !previewReel;
            return (
              <button
                key={cam.id}
                type="button"
                onClick={() => setCameraPreset(cam.id)}
                aria-pressed={active}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'text-zinc-300 hover:text-white active:bg-white/10'
                }`}
              >
                {cam.label}
              </button>
            );
          })}
        </div>

        {/* Primary Mobile Thumb Actions (44px+ hitboxes) */}
        <nav
          aria-label="Mobile Studio Controls"
          className={`pointer-events-auto w-full max-w-md grid grid-cols-4 gap-1.5 p-1.5 rounded-2xl shadow-2xl ${glassSurface}`}
        >
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Customize Design"
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600/90 active:scale-[0.98] whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            Design
          </button>

          <button
            type="button"
            onClick={togglePreviewReel}
            aria-pressed={previewReel}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              previewReel
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-zinc-200 hover:bg-white/10 border border-transparent'
            }`}
          >
            {previewReel ? (
              <Square className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Clapperboard className="w-3.5 h-3.5 shrink-0" />
            )}
            {previewReel ? 'Stop' : 'Reel'}
          </button>

          <button
            type="button"
            onClick={toggleFlip}
            aria-pressed={isFlipped}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              isFlipped
                ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-400/40'
                : 'text-zinc-200 hover:bg-white/10 border border-transparent'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5 shrink-0" />
            Flip
          </button>

          <button
            type="button"
            onClick={() => openExportModal('still')}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 rounded-xl text-xs font-medium text-zinc-100 bg-white/10 active:bg-white/15 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Still
          </button>
        </nav>
      </div>

      {/* Desktop Unified Floating Control Dock (>= 1024px) */}
      <div className="hidden lg:flex pointer-events-none absolute inset-x-0 bottom-5 z-20 flex-col items-center px-4">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className={`pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-zinc-300 hover:text-white transition-colors ${glassSurface}`}
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show Controls
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Hide Controls
            </>
          )}
        </button>

        {!collapsed && (
          <nav
            aria-label="Viewport and Render Controls"
            className={`pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-2xl shadow-2xl max-w-[calc(100vw-392px)] ${glassSurface}`}
          >
            <button
              type="button"
              onClick={togglePreviewReel}
              aria-pressed={previewReel}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                previewReel
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
                  : 'text-zinc-100 hover:bg-white/10 border border-transparent'
              }`}
            >
              {previewReel ? (
                <Square className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <Clapperboard className="w-3.5 h-3.5 text-indigo-300" />
              )}
              {previewReel ? 'Stop Reel' : 'Preview Reel'}
            </button>

            <button
              type="button"
              onClick={toggleFlip}
              aria-pressed={isFlipped}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                isFlipped
                  ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-400/40'
                  : 'text-zinc-200 hover:bg-white/10 border border-transparent'
              }`}
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
              Flip 180°
            </button>

            <button
              type="button"
              onClick={toggleLanyard}
              aria-pressed={showLanyard}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                !showLanyard
                  ? 'bg-amber-500/15 text-amber-200 border border-amber-400/40'
                  : 'text-zinc-200 hover:bg-white/10 border border-transparent'
              }`}
            >
              {showLanyard ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showLanyard ? 'Hide Lanyard' : 'Show Lanyard'}
            </button>

            <button
              type="button"
              onClick={toggleAutoSpin}
              aria-pressed={autoSpin}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                autoSpin
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                  : 'text-zinc-200 hover:bg-white/10 border border-transparent'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoSpin ? 'animate-spin' : ''}`} />
              Spin
            </button>

            <div className="w-px h-5 bg-white/10 mx-0.5 hidden sm:block" aria-hidden="true" />

            {/* Camera Presets (1-4) */}
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-xl bg-black/35 border border-white/10"
              role="group"
              aria-label="Camera Presets"
            >
              {CAMERA_BUTTONS.map((cam) => {
                const active = cameraPreset === cam.id && !previewReel;
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => setCameraPreset(cam.id)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      active
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-zinc-500">{cam.keyHint}</span>
                    {cam.label}
                  </button>
                );
              })}
            </div>

            <div className="w-px h-5 bg-white/10 mx-0.5 hidden sm:block" aria-hidden="true" />

            {/* Offline 1080p Render Actions */}
            <button
              type="button"
              onClick={() => openExportModal('still')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-100 bg-white/10 hover:bg-white/15 border border-white/10 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              1080p Still
            </button>

            <button
              type="button"
              onClick={() => openExportModal('video')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              <Film className="w-3.5 h-3.5" />
              Render 1080p 60fps MP4
            </button>
          </nav>
        )}
      </div>
    </>
  );
}
