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
  Laptop,
  RefreshCw,
  Share2,
  Shield,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Square,
  User,
} from 'lucide-react';
import { useStudioStore, type CameraPresetId } from '../../store/useStudioStore';
import type { PlacementSceneId } from '../../geometry/placementGeometry';
import { detectSoftwareWebGL } from '../../utils/webglDetect';

const CAMERA_BUTTONS: Array<{ id: CameraPresetId; keyHint: string; label: string }> = [
  { id: 'full', keyHint: '1', label: 'Full' },
  { id: 'front', keyHint: '2', label: 'Front' },
  { id: 'back', keyHint: '3', label: 'Back' },
  { id: 'macro', keyHint: '4', label: 'Macro' },
];

const PLACEMENT_BUTTONS: Array<{
  id: PlacementSceneId;
  label: string;
  ariaLabel: string;
  Icon: typeof Sparkles;
}> = [
  { id: 'studio', label: 'Studio', ariaLabel: 'Studio Floating Placement', Icon: Sparkles },
  { id: 'table', label: 'Table', ariaLabel: 'On Table Placement', Icon: Laptop },
  { id: 'torso', label: 'Torso', ariaLabel: 'On Torso Placement', Icon: User },
  { id: 'hanger', label: 'Hanger', ariaLabel: 'On Hanger Placement', Icon: Shirt },
];

export function FloatingDock() {
  const [collapsed, setCollapsed] = useState(false);
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);

  const isFlipped = useStudioStore((s) => s.isFlipped);
  const toggleFlip = useStudioStore((s) => s.toggleFlip);
  const showLanyard = useStudioStore((s) => s.showLanyard);
  const toggleLanyard = useStudioStore((s) => s.toggleLanyard);
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const toggleCardCase = useStudioStore((s) => s.toggleCardCase);
  const autoSpin = useStudioStore((s) => s.autoSpin);
  const toggleAutoSpin = useStudioStore((s) => s.toggleAutoSpin);
  const previewReel = useStudioStore((s) => s.previewReel);
  const togglePreviewReel = useStudioStore((s) => s.togglePreviewReel);
  const cameraPreset = useStudioStore((s) => s.cameraPreset);
  const setCameraPreset = useStudioStore((s) => s.setCameraPreset);
  const placementScene = useStudioStore((s) => s.placementScene);
  const setPlacementScene = useStudioStore((s) => s.setPlacementScene);
  const openExportModal = useStudioStore((s) => s.openExportModal);
  const setMobileDrawerOpen = useStudioStore((s) => s.setMobileDrawerOpen);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  // High-contrast floating glass HUD legible over both Obsidian/Slate and bright Studio Light backdrops
  const glassSurface = isSoftwareGl
    ? 'bg-zinc-950/95 border border-white/14 shadow-[0_12px_32px_rgba(0,0,0,0.45)]'
    : 'bg-zinc-950/84 backdrop-blur-xl border border-white/12 shadow-[0_12px_36px_rgba(0,0,0,0.42)]';

  const openMobilePresets = () => {
    setActiveTab('presets');
    setMobileDrawerOpen(true);
  };

  const cycleMobileCamera = () => {
    const idx = CAMERA_BUTTONS.findIndex((c) => c.id === cameraPreset);
    const next = CAMERA_BUTTONS[(idx + 1) % CAMERA_BUTTONS.length];
    setCameraPreset(next.id);
  };

  const activeCameraLabel =
    CAMERA_BUTTONS.find((c) => c.id === cameraPreset)?.label ?? 'Full';

  return (
    <>
      {/* Desktop Top-Center Placement Switcher (>= 1024px) — keeps bottom unobstructed */}
      <div className="hidden lg:flex pointer-events-none absolute inset-x-0 top-4 z-20 justify-center px-4">
        <div
          role="group"
          aria-label="Placement Simulation"
          className={`pointer-events-auto inline-flex items-center gap-1 p-1 rounded-2xl ${glassSurface}`}
        >
          {PLACEMENT_BUTTONS.map(({ id, label, ariaLabel, Icon }) => {
            const active = placementScene === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPlacementScene(id)}
                aria-pressed={active}
                aria-label={ariaLabel}
                className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-[0_2px_10px_rgba(79,70,229,0.4)]'
                    : 'text-zinc-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Compact Top Bar (< 1024px) — slim header keeping 85%+ viewport clear */}
      <div className="lg:hidden pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 py-2">
        <div className={`pointer-events-auto px-3 py-1.5 rounded-xl ${glassSurface}`}>
          <span className="text-xs font-semibold tracking-tight text-zinc-100 whitespace-nowrap">
            BadgeForge 3D
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={openMobilePresets}
            aria-label="Open Shared Presets"
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-medium text-zinc-100 active:scale-[0.98] whitespace-nowrap transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${glassSurface}`}
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            Share
          </button>
          <button
            type="button"
            onClick={() => openExportModal('video')}
            aria-label="Render 1080p 24fps MP4"
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] shadow-lg whitespace-nowrap transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <Film className="w-3.5 h-3.5 shrink-0" />
            MP4
          </button>
        </div>
      </div>

      {/* Mobile Streamlined Bottom HUD (< 1024px) — 2 compact rows <= 14.5% viewport height */}
      <div className="lg:hidden pointer-events-none absolute inset-x-0 bottom-2.5 z-20 flex flex-col items-center gap-1.5 px-3">
        {/* Compact Placement Simulation Strip */}
        <div
          className={`pointer-events-auto flex items-center gap-0.5 p-1 rounded-xl ${glassSurface}`}
          role="group"
          aria-label="Mobile Placement Simulation"
        >
          {PLACEMENT_BUTTONS.map(({ id, label, ariaLabel, Icon }) => {
            const active = placementScene === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPlacementScene(id)}
                aria-pressed={active}
                aria-label={ariaLabel}
                className={`min-h-[32px] inline-flex items-center gap-1 px-2.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-300 hover:text-white active:bg-white/10'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Primary Mobile Thumb Actions (44px hitboxes) */}
        <nav
          aria-label="Mobile Studio Controls"
          className={`pointer-events-auto w-full max-w-md grid grid-cols-4 gap-1 p-1 rounded-2xl ${glassSurface}`}
        >
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Customize Design"
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 active:scale-[0.98] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            Design
          </button>

          <button
            type="button"
            onClick={cycleMobileCamera}
            aria-label={`Switch camera angle (current: ${activeCameraLabel})`}
            className="min-h-[44px] inline-flex items-center justify-center gap-1 px-2 rounded-xl text-xs font-medium text-zinc-100 hover:bg-white/10 active:bg-white/15 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            {activeCameraLabel}
          </button>

          <button
            type="button"
            onClick={toggleFlip}
            aria-pressed={isFlipped}
            aria-label="Flip ID card 180 degrees"
            className={`min-h-[44px] inline-flex items-center justify-center gap-1 px-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              isFlipped
                ? 'bg-indigo-600/30 text-indigo-100 border border-indigo-400/45'
                : 'text-zinc-200 hover:bg-white/10 border border-transparent'
            }`}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5 shrink-0" />
            Flip
          </button>

          <button
            type="button"
            onClick={() => openExportModal('still')}
            aria-label="Export 12MP Still Image"
            className="min-h-[44px] inline-flex items-center justify-center gap-1 px-2 rounded-xl text-xs font-medium text-zinc-100 bg-white/10 active:bg-white/15 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Still
          </button>
        </nav>
      </div>

      {/* Desktop Single-Row Unified Bottom Control Dock (>= 1024px) */}
      <div className="hidden lg:flex pointer-events-none absolute inset-x-0 bottom-4 z-20 justify-center px-4">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-expanded={false}
            aria-label="Show Viewport Controls"
            className={`pointer-events-auto min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-200 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${glassSurface}`}
          >
            <ChevronUp className="w-3.5 h-3.5 text-indigo-300" />
            Show Controls
          </button>
        ) : (
          <nav
            aria-label="Viewport and Render Controls"
            className={`pointer-events-auto flex flex-nowrap items-center gap-1 p-1.5 rounded-2xl max-w-[calc(100vw-392px)] overflow-x-auto ${glassSurface}`}
          >
            {/* Inline Collapse Toggle (no hovering pill above the dock) */}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-label="Hide Viewport Controls"
              title="Collapse control bar"
              className="min-h-[36px] min-w-[32px] inline-flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />

            <button
              type="button"
              onClick={togglePreviewReel}
              aria-pressed={previewReel}
              aria-label={previewReel ? 'Stop Cinematic Reel' : 'Preview Cinematic Reel'}
              title="Toggle Cinematic Reel (R)"
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                previewReel
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
                  : 'text-zinc-100 hover:bg-white/10 border border-transparent'
              }`}
            >
              {previewReel ? (
                <Square className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              ) : (
                <Clapperboard className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
              )}
              {previewReel ? 'Stop' : 'Reel'}
            </button>

            <button
              type="button"
              onClick={toggleFlip}
              aria-pressed={isFlipped}
              aria-label="Flip 180 degrees"
              title="Flip ID Card 180° (F)"
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                isFlipped
                  ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-400/45'
                  : 'text-zinc-200 hover:bg-white/10 border border-transparent'
              }`}
            >
              <FlipHorizontal2 className="w-3.5 h-3.5 shrink-0" />
              Flip
            </button>

            <button
              type="button"
              onClick={toggleLanyard}
              aria-pressed={showLanyard}
              aria-label={showLanyard ? 'Hide Lanyard' : 'Show Lanyard'}
              title="Toggle Lanyard Visibility"
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                !showLanyard
                  ? 'bg-amber-500/15 text-amber-200 border border-amber-400/40'
                  : 'text-zinc-200 hover:bg-white/10 border border-transparent'
              }`}
            >
              {showLanyard ? (
                <Eye className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
              )}
              Lanyard
            </button>

            <button
              type="button"
              onClick={toggleCardCase}
              aria-pressed={cardCaseEnabled}
              aria-label={
                cardCaseEnabled ? 'Disable Protective Badge Case' : 'Enable Protective Badge Case'
              }
              title="Toggle Protective Badge Case"
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                cardCaseEnabled
                  ? 'bg-indigo-600/25 text-indigo-200 border border-indigo-400/45'
                  : 'text-zinc-200 hover:bg-white/10 border border-transparent'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              Case
            </button>

            <button
              type="button"
              onClick={toggleAutoSpin}
              aria-pressed={autoSpin}
              aria-label="Toggle Turntable Spin"
              title="Toggle 360° Turntable Spin (Space)"
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                autoSpin
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                  : 'text-zinc-200 hover:bg-white/10 border border-transparent'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${autoSpin ? 'animate-spin' : ''}`} />
              Spin
            </button>

            <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />

            {/* Camera Presets (1-4) */}
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-xl bg-black/45 border border-white/10 shrink-0"
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
                    title={`${cam.label} Camera View (${cam.keyHint})`}
                    className={`min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      active
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'text-zinc-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span
                      className={`text-[10px] font-mono ${
                        active ? 'text-zinc-600' : 'text-zinc-500'
                      }`}
                    >
                      {cam.keyHint}
                    </span>
                    {cam.label}
                  </button>
                );
              })}
            </div>

            <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />

            {/* Offline 12MP Still & 1080p24 Render Actions */}
            <button
              type="button"
              onClick={() => openExportModal('still')}
              aria-label="Export 12MP Still Image"
              title="Export 12MP Studio Photograph"
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-100 bg-white/10 hover:bg-white/16 border border-white/10 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              12MP Still
            </button>

            <button
              type="button"
              onClick={() => openExportModal('video')}
              aria-label="Render 1080p 24fps MP4"
              title="Render 1080p Cinema MP4 Video"
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-[0_2px_12px_rgba(79,70,229,0.4)] whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              <Film className="w-3.5 h-3.5 shrink-0" />
              Render MP4
            </button>
          </nav>
        )}
      </div>
    </>
  );
}
