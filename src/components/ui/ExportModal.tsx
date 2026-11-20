import { useEffect, useRef } from 'react';
import { AlertCircle, Camera, CheckCircle2, Film, Loader2, X } from 'lucide-react';
import { useStudioStore, type ExportMode } from '../../store/useStudioStore';
import { render1080p60Animation, render1080pStill } from '../../utils/renderEngine';
import {
  EXPORT_RESOLUTIONS,
  type AnimationPreset,
  type ExportAspectRatio,
} from '../../utils/physicsEngine';

const VIDEO_PRESETS: Array<{ id: AnimationPreset; title: string; desc: string }> = [
  {
    id: 'cinematic-360',
    title: 'Complete Showcase (Cinematic + 360°)',
    desc: 'Slow Hermite-spline Full → Front → Back → Macro (Top to Bottom) sweep followed seamlessly by a full 360° orbit',
  },
  {
    id: 'cinematic-reel',
    title: 'Cinematic Showcase Reel (Full → Front → Back → Macro)',
    desc: 'Graceful quintic-eased Hermite camera path cycling Full, Front, Back, and Top-to-Bottom Macro crane',
  },
  {
    id: 'turntable',
    title: '360° Seamless Turntable',
    desc: 'Smooth quintic-eased full revolution showcasing front, back, and woven lanyard',
  },
  {
    id: 'pendulum-flip',
    title: '180° Pendulum Flip & Return',
    desc: 'Deterministic spring-damped swivel clasp flip revealing the back side and returning',
  },
  {
    id: 'parallax-sway',
    title: 'Hero Parallax Sway',
    desc: 'Studio hero oscillation catching PVC clearcoat and holographic foil shifts',
  },
];

const ASPECT_OPTIONS: ExportAspectRatio[] = ['16:9', '9:16', '1:1'];

export function ExportModal() {
  const open = useStudioStore((s) => s.exportModalOpen);
  const mode = useStudioStore((s) => s.exportModalMode);
  const openExportModal = useStudioStore((s) => s.openExportModal);
  const closeExportModal = useStudioStore((s) => s.closeExportModal);

  const exportAspect = useStudioStore((s) => s.exportAspect);
  const setExportAspect = useStudioStore((s) => s.setExportAspect);
  const stillFormat = useStudioStore((s) => s.stillFormat);
  const setStillFormat = useStudioStore((s) => s.setStillFormat);
  const stillTransparentBg = useStudioStore((s) => s.stillTransparentBg);
  const setStillTransparentBg = useStudioStore((s) => s.setStillTransparentBg);

  const videoPreset = useStudioStore((s) => s.videoPreset);
  const setVideoPreset = useStudioStore((s) => s.setVideoPreset);
  const videoDurationSec = useStudioStore((s) => s.videoDurationSec);
  const setVideoDurationSec = useStudioStore((s) => s.setVideoDurationSec);

  const renderProgress = useStudioStore((s) => s.renderProgress);
  const setRenderProgress = useStudioStore((s) => s.setRenderProgress);
  const rigBridge = useStudioStore((s) => s.rigBridge);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useStudioStore.getState().renderProgress.isRendering) {
        closeExportModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeExportModal]);

  if (!open) return null;

  const totalFrames = videoDurationSec * 60;
  const activeRes = EXPORT_RESOLUTIONS[exportAspect];

  const handleStartStillRender = async () => {
    if (!rigBridge || renderProgress.isRendering) return;
    setRenderProgress({
      isRendering: true,
      mode: 'still',
      currentFrame: 0,
      totalFrames: 1,
      percent: 25,
      stageLabel: `Rendering ${activeRes.width}×${activeRes.height} MSAA still frame...`,
      error: null,
      lastCompletedFile: null,
    });

    await new Promise((r) => setTimeout(r, 16));

    try {
      const msaaSamples = useStudioStore.getState().performanceTier.msaaSamples;
      const filename = await render1080pStill(rigBridge, {
        format: stillFormat,
        transparentBg: stillTransparentBg,
        aspectRatio: exportAspect,
        msaaSamples,
      });
      setRenderProgress({
        isRendering: false,
        currentFrame: 1,
        totalFrames: 1,
        percent: 100,
        stageLabel: `Exported ${filename}`,
        lastCompletedFile: filename,
      });
    } catch (err) {
      setRenderProgress({
        isRendering: false,
        percent: 0,
        stageLabel: 'Render failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleStartVideoRender = async () => {
    if (!rigBridge || renderProgress.isRendering) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setRenderProgress({
      isRendering: true,
      mode: 'video',
      currentFrame: 0,
      totalFrames,
      percent: 0,
      stageLabel: `Preparing ${totalFrames} deterministic frames at 60 fps...`,
      error: null,
      lastCompletedFile: null,
    });

    try {
      const msaaSamples = useStudioStore.getState().performanceTier.msaaSamples;
      const filename = await render1080p60Animation(rigBridge, {
        preset: videoPreset,
        durationSec: videoDurationSec,
        aspectRatio: exportAspect,
        msaaSamples,
        signal: controller.signal,
        onProgress: (frame, total, stageLabel) => {
          setRenderProgress({
            currentFrame: frame,
            totalFrames: total,
            percent: Math.round((frame / Math.max(1, total)) * 100),
            stageLabel,
          });
        },
      });

      setRenderProgress({
        isRendering: false,
        currentFrame: totalFrames,
        totalFrames,
        percent: 100,
        stageLabel: `Exported ${filename}`,
        lastCompletedFile: filename,
      });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      setRenderProgress({
        isRendering: false,
        percent: 0,
        stageLabel: isAbort ? 'Render cancelled' : 'Render failed',
        error: isAbort ? null : err instanceof Error ? err.message : String(err),
      });
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelRender = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-zinc-900 border border-white/12 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h2 id="export-modal-title" className="text-base font-semibold text-zinc-100">
              Offline Studio Renderer
            </h2>
            <p className="text-xs font-mono tabular-nums text-zinc-400 mt-0.5">
              {activeRes.width}×{activeRes.height} · MSAA · Zero Dropped Frames
            </p>
          </div>
          <button
            type="button"
            onClick={closeExportModal}
            disabled={renderProgress.isRendering}
            aria-label="Close export modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 sm:px-6 pt-4 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0b0d10] border border-white/10">
            {(
              [
                { id: 'still', label: '1080p Still Image', icon: Camera },
                { id: 'video', label: '1080p 60fps Video', icon: Film },
              ] as Array<{ id: ExportMode; label: string; icon: typeof Camera }>
            ).map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={renderProgress.isRendering}
                  onClick={() => openExportModal(tab.id)}
                  className={`min-h-[40px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto studio-scroll flex-1">
          {/* Aspect Ratio / Device Format Selector */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-300">Aspect Ratio & Output Size</span>
            <div className="grid grid-cols-3 gap-1.5">
              {ASPECT_OPTIONS.map((ratio) => {
                const info = EXPORT_RESOLUTIONS[ratio];
                const active = exportAspect === ratio;
                return (
                  <button
                    key={ratio}
                    type="button"
                    disabled={renderProgress.isRendering}
                    onClick={() => setExportAspect(ratio)}
                    className={`min-h-[44px] py-2 px-2 rounded-lg border text-center transition-colors ${
                      active
                        ? 'bg-indigo-600/20 border-indigo-400/50 text-indigo-200'
                        : 'bg-[#0b0d10] border-white/10 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="text-xs font-semibold whitespace-nowrap">{info.shortLabel}</div>
                    <div className="text-[10px] font-mono tabular-nums opacity-75">
                      {info.width}×{info.height}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {mode === 'still' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-medium text-zinc-300">Image Format</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['png', 'jpg'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      disabled={renderProgress.isRendering}
                      onClick={() => setStillFormat(fmt)}
                      className={`min-h-[44px] py-2.5 px-3 rounded-lg border text-xs font-semibold uppercase transition-colors ${
                        stillFormat === fmt
                          ? 'bg-indigo-600/20 border-indigo-400/50 text-indigo-200'
                          : 'bg-[#0b0d10] border-white/10 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {fmt} {fmt === 'png' ? '(Lossless)' : '(High Quality)'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#0b0d10] border border-white/10 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Transparent Background</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    Exports clean alpha-channel PNG cutout without studio backdrop
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={stillTransparentBg && stillFormat === 'png'}
                  disabled={stillFormat !== 'png' || renderProgress.isRendering}
                  onChange={(e) => setStillTransparentBg(e.target.checked)}
                  className="w-5 h-5 accent-indigo-500 rounded shrink-0"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Animation Preset */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-zinc-300">Camera & Motion Choreography</span>
                <div className="space-y-2">
                  {VIDEO_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={renderProgress.isRendering}
                      onClick={() => setVideoPreset(preset.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        videoPreset === preset.id
                          ? 'bg-indigo-600/18 border-indigo-400/50 text-zinc-100'
                          : 'bg-[#0b0d10] border-white/10 text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-semibold">{preset.title}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        {preset.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration / Frame Count */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-zinc-300">
                  Duration (Locked 60 fps · Slow Eased Pacing)
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {([12, 16, 20, 24] as const).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      disabled={renderProgress.isRendering}
                      onClick={() => setVideoDurationSec(sec)}
                      className={`min-h-[44px] py-2 px-1.5 rounded-lg border text-xs font-mono tabular-nums transition-colors ${
                        videoDurationSec === sec
                          ? 'bg-indigo-600/20 border-indigo-400/50 text-indigo-200'
                          : 'bg-[#0b0d10] border-white/10 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {sec}s
                      <span className="block text-[10px] opacity-70">{sec * 60}f</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Render Progress Panel */}
          {(renderProgress.isRendering ||
            renderProgress.lastCompletedFile ||
            renderProgress.error) && (
            <div className="rounded-xl bg-[#0b0d10] border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono tabular-nums text-zinc-200 flex items-center gap-2 min-w-0">
                  {renderProgress.isRendering ? (
                    <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                  ) : renderProgress.error ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate">{renderProgress.stageLabel}</span>
                </span>
                <span className="font-mono tabular-nums text-zinc-400 shrink-0">
                  {renderProgress.percent}%
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-150 ${
                    renderProgress.error
                      ? 'bg-rose-500'
                      : renderProgress.lastCompletedFile
                        ? 'bg-emerald-500'
                        : 'bg-indigo-500'
                  }`}
                  style={{ width: `${renderProgress.percent}%` }}
                />
              </div>

              {renderProgress.error && (
                <p className="text-[11px] text-rose-300 leading-relaxed">
                  {renderProgress.error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 border-t border-white/10 bg-[#0d1016] flex items-center justify-end gap-2.5 shrink-0">
          {renderProgress.isRendering ? (
            <button
              type="button"
              onClick={handleCancelRender}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-rose-200 bg-rose-600/25 hover:bg-rose-600/35 border border-rose-500/40 transition-colors"
            >
              Cancel Render
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={closeExportModal}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={mode === 'still' ? handleStartStillRender : handleStartVideoRender}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                {mode === 'still' ? (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    Export {activeRes.width}×{activeRes.height} {stillFormat.toUpperCase()}
                  </>
                ) : (
                  <>
                    <Film className="w-3.5 h-3.5" />
                    Render {totalFrames} Frames (60fps)
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
