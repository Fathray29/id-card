import { useMemo, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Film,
  FlipHorizontal2,
  RefreshCw,
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
  const cameraPreset = useStudioStore((s) => s.cameraPreset);
  const setCameraPreset = useStudioStore((s) => s.setCameraPreset);
  const openExportModal = useStudioStore((s) => s.openExportModal);

  const glassSurface = isSoftwareGl
    ? 'bg-zinc-900/95 border border-white/12'
    : 'bg-zinc-900/85 backdrop-blur-xl border border-white/10';

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center px-4">
      {/* Collapse / Expand Cinema Mode Toggle */}
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

      {/* Unified Horizontal Floating Dock */}
      {!collapsed && (
        <nav
          aria-label="Viewport and Render Controls"
          className={`pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-2xl shadow-2xl max-w-[calc(100vw-392px)] ${glassSurface}`}
        >
          {/* Rig Motion Actions */}
          <button
            type="button"
            onClick={toggleFlip}
            aria-pressed={isFlipped}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
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
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
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
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              autoSpin
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-zinc-200 hover:bg-white/10 border border-transparent'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoSpin ? 'animate-spin' : ''}`} />
            Preview Spin
          </button>

          <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" aria-hidden="true" />

          {/* Camera Presets (1-4) */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-xl bg-black/35 border border-white/10"
            role="group"
            aria-label="Camera Presets"
          >
            {CAMERA_BUTTONS.map((cam) => {
              const active = cameraPreset === cam.id;
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
                  <span
                    className={`text-[10px] font-mono ${
                      active ? 'text-zinc-500' : 'text-zinc-500'
                    }`}
                  >
                    {cam.keyHint}
                  </span>
                  {cam.label}
                </button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" aria-hidden="true" />

          {/* Offline 1080p Render Actions */}
          <button
            type="button"
            onClick={() => openExportModal('still')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-100 bg-white/10 hover:bg-white/15 border border-white/10 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            Render 1080p Still
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
  );
}
