import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Layers,
  RotateCcw,
  RotateCw,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  useStudioStore,
  type CardCaseStyle,
  type CardFinish,
  type EdgeMaterialPreset,
  type FitMode,
  type HardwareFinish,
  type LayerId,
  type SampleTemplateId,
  type SidebarTabId,
} from '../../store/useStudioStore';
import { LAYER_DIMENSIONS, renderLayerToCanvas } from '../../utils/texturePipeline';
import { CARD_SPECS } from '../../geometry/cardGeometry';
import {
  computeBackdropOpacity,
  computeDrawerDragOffset,
  shouldDismissDrawerOnRelease,
} from '../../utils/drawerGesture';
import { PresetsPanel } from './PresetsPanel';

const TABS: Array<{ id: SidebarTabId; label: string; spec: string }> = [
  { id: 'front', label: 'Front', spec: '5.4×8.56' },
  { id: 'back', label: 'Back', spec: '5.4×8.56' },
  { id: 'lanyard', label: 'Lanyard', spec: '80×2cm' },
  { id: 'finish', label: 'Finish', spec: 'PBR/FX' },
  { id: 'presets', label: 'Presets', spec: 'Share' },
];

const TEMPLATES: Array<{
  id: SampleTemplateId;
  name: string;
  subtitle: string;
  swatches: [string, string, string];
}> = [
  {
    id: 'tech-vip',
    name: 'Tech Conference VIP Pass',
    subtitle: 'Meridian Summit · Glossy Black Core',
    swatches: ['#0c1122', '#6366f1', '#10b981'],
  },
  {
    id: 'corporate-sec',
    name: 'Corporate Security Badge',
    subtitle: 'Northstar Aero · Clean White PVC',
    swatches: ['#f8fafc', '#0f2942', '#0ea5e9'],
  },
  {
    id: 'minimal-staff',
    name: 'Minimalist Staff ID',
    subtitle: 'Atelier Kōbō · Matte Gold Edge',
    swatches: ['#141416', '#d4af37', '#52525b'],
  },
];

const BG_SWATCHES = ['#0c1122', '#141416', '#f8fafc', '#0f2942', '#1e1b4b', '#064e3b'];

function ArtboardPreview({ layerId }: { layerId: LayerId }) {
  const layer = useStudioStore((s) => s.layers[layerId]);
  const activeTemplate = useStudioStore((s) => s.activeTemplate);
  const updateLayer = useStudioStore((s) => s.updateLayer);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<{ url: string | null; img: HTMLImageElement | null }>({
    url: null,
    img: null,
  });

  // Drag-to-pan directly on the 2D artboard
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  }>({ active: false, startX: 0, startY: 0, origOffsetX: 0, origOffsetY: 0 });
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const paint = (img: HTMLImageElement | null) => {
      if (cancelled) return;
      renderLayerToCanvas(canvas, layerId, layer, activeTemplate, img);
    };

    if (!layer.uploadedImageUrl) {
      imgCacheRef.current = { url: null, img: null };
      paint(null);
      return;
    }

    if (imgCacheRef.current.url === layer.uploadedImageUrl && imgCacheRef.current.img) {
      paint(imgCacheRef.current.img);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgCacheRef.current = { url: layer.uploadedImageUrl, img };
      paint(img);
    };
    img.src = layer.uploadedImageUrl;

    return () => {
      cancelled = true;
    };
  }, [layerId, layer, activeTemplate]);

  const isCard = layerId !== 'lanyard';
  const dims = LAYER_DIMENSIONS[layerId];

  // Exact metric guide percentages for CR80 (5.4 x 8.56 cm)
  const safeInsetX = (0.2 / CARD_SPECS.width) * 100; // 2mm safe zone
  const safeInsetY = (0.2 / CARD_SPECS.height) * 100;
  const slotWPercent = (CARD_SPECS.slotWidth / CARD_SPECS.width) * 100;
  const slotHPercent = (CARD_SPECS.slotHeight / CARD_SPECS.height) * 100;
  // Slot center is 0.5 cm down from top edge of 8.56 cm card
  const slotTopPercent = ((0.5 - CARD_SPECS.slotHeight / 2) / CARD_SPECS.height) * 100;

  // Ruler ticks
  const horizontalTicks = useMemo(
    () => (isCard ? [0, 1, 2, 3, 4, 5] : [0, 10, 20, 30, 40, 50, 60, 70, 80]),
    [isCard]
  );
  const verticalTicks = useMemo(
    () => (isCard ? [0, 2, 4, 6, 8] : [0, 1, 2]),
    [isCard]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: layer.offsetX,
      origOffsetY: layer.offsetY,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startX) / Math.max(1, rect.width);
    const dy = (e.clientY - dragRef.current.startY) / Math.max(1, rect.height);
    updateLayer(layerId, {
      offsetX: Math.max(-1, Math.min(1, Number((dragRef.current.origOffsetX + dx).toFixed(3)))),
      offsetY: Math.max(-1, Math.min(1, Number((dragRef.current.origOffsetY + dy).toFixed(3)))),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer already released
    }
  };

  return (
    <div className="rounded-xl bg-[#090b0f] border border-white/10 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-300">
          {isCard
            ? `${layerId === 'front' ? 'Front' : 'Back'} Artboard`
            : 'Continuous Strap Artboard'}
        </span>
        <span className="text-[11px] font-mono tabular-nums text-zinc-400">
          {isCard ? '5.4 × 8.56 cm · 600 DPI' : '80.0 × 2.0 cm · 40:1'}
        </span>
      </div>

      {/* Ruler + Artboard Grid */}
      <div className="flex flex-col items-center">
        {/* Top cm ruler */}
        <div
          className="relative h-5 ml-6 select-none"
          style={{ width: isCard ? '168px' : '280px' }}
          aria-hidden="true"
        >
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/15" />
          {horizontalTicks.map((cm) => {
            const maxCm = isCard ? CARD_SPECS.width : 80;
            const leftPct = (cm / maxCm) * 100;
            return (
              <div
                key={cm}
                className="absolute bottom-0 flex flex-col items-center -translate-x-1/2"
                style={{ left: `${leftPct}%` }}
              >
                <span className="text-[9px] font-mono tabular-nums text-zinc-500 leading-none mb-0.5">
                  {cm}
                </span>
                <div className="w-px h-1.5 bg-zinc-500/70" />
              </div>
            );
          })}
        </div>

        <div className="flex items-stretch">
          {/* Left cm ruler */}
          <div
            className="relative w-6 select-none"
            style={{ height: isCard ? '266px' : '52px' }}
            aria-hidden="true"
          >
            <div className="absolute inset-y-0 right-0 w-px bg-white/15" />
            {verticalTicks.map((cm) => {
              const maxCm = isCard ? CARD_SPECS.height : 2;
              const topPct = (cm / maxCm) * 100;
              return (
                <div
                  key={cm}
                  className="absolute right-0 flex items-center -translate-y-1/2"
                  style={{ top: `${topPct}%` }}
                >
                  <span className="text-[9px] font-mono tabular-nums text-zinc-500 mr-1 leading-none">
                    {cm}
                  </span>
                  <div className="h-px w-1.5 bg-zinc-500/70" />
                </div>
              );
            })}
          </div>

          {/* Interactive Draggable Artboard Canvas */}
          <div
            className={`relative overflow-hidden border border-white/20 bg-zinc-950 touch-none ${
              isCard ? 'rounded-[10px]' : 'rounded-[4px]'
            } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
              width: isCard ? '168px' : '280px',
              height: isCard ? '266px' : '52px',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title="Drag to reposition artwork"
            data-testid={`artboard-preview-${layerId}`}
          >
            <canvas
              ref={canvasRef}
              width={dims.width}
              height={dims.height}
              className="w-full h-full object-fill pointer-events-none block"
            />

            {/* 2mm Print Safe-Zone Guide */}
            <div
              className="pointer-events-none absolute border border-dashed border-emerald-400/70"
              style={
                isCard
                  ? {
                      left: `${safeInsetX}%`,
                      right: `${safeInsetX}%`,
                      top: `${safeInsetY}%`,
                      bottom: `${safeInsetY}%`,
                      borderRadius: '6px',
                    }
                  : {
                      left: '2px',
                      right: '2px',
                      top: '12%',
                      bottom: '12%',
                    }
              }
            />

            {/* Exact 1.4 x 0.3 cm Slot Punch Cutout Warning Zone (Bare Card Front & Back only) */}
            {isCard && !cardCaseEnabled && (
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border border-rose-400/90 bg-black/65 shadow-[0_0_0_1px_rgba(244,63,94,0.3)]"
                style={{
                  width: `${slotWPercent}%`,
                  height: `${slotHPercent}%`,
                  top: `${slotTopPercent}%`,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Compact Guide Legend (Zero Pills — quiet unboxed text with separators) */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed border-emerald-400" />
          2mm safe zone
        </span>
        {isCard ? (
          cardCaseEnabled ? (
            <span className="text-zinc-400">Solid card (in case)</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-1.5 rounded-full border border-rose-400 bg-black/70" />
              1.4×0.3cm punch
            </span>
          )
        ) : (
          <span className="text-zinc-500">Drag preview to pan</span>
        )}
      </div>
    </div>
  );
}

export function SidebarEditor() {
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const mobileDrawerOpen = useStudioStore((s) => s.mobileDrawerOpen);
  const setMobileDrawerOpen = useStudioStore((s) => s.setMobileDrawerOpen);
  const activeTemplate = useStudioStore((s) => s.activeTemplate);
  const applyTemplate = useStudioStore((s) => s.applyTemplate);
  const layers = useStudioStore((s) => s.layers);
  const updateLayer = useStudioStore((s) => s.updateLayer);
  const setLayerUpload = useStudioStore((s) => s.setLayerUpload);
  const resetLayerTransform = useStudioStore((s) => s.resetLayerTransform);

  const cardFinish = useStudioStore((s) => s.cardFinish);
  const setCardFinish = useStudioStore((s) => s.setCardFinish);
  const cardCaseEnabled = useStudioStore((s) => s.cardCaseEnabled);
  const setCardCaseEnabled = useStudioStore((s) => s.setCardCaseEnabled);
  const cardCaseStyle = useStudioStore((s) => s.cardCaseStyle);
  const setCardCaseStyle = useStudioStore((s) => s.setCardCaseStyle);
  const edgePreset = useStudioStore((s) => s.edgePreset);
  const setEdgePreset = useStudioStore((s) => s.setEdgePreset);
  const hardwareFinish = useStudioStore((s) => s.hardwareFinish);
  const setHardwareFinish = useStudioStore((s) => s.setHardwareFinish);
  const hologramEnabled = useStudioStore((s) => s.hologramEnabled);
  const setHologramEnabled = useStudioStore((s) => s.setHologramEnabled);
  const hologramIntensity = useStudioStore((s) => s.hologramIntensity);
  const setHologramIntensity = useStudioStore((s) => s.setHologramIntensity);
  const studioBackdrop = useStudioStore((s) => s.studioBackdrop);
  const setStudioBackdrop = useStudioStore((s) => s.setStudioBackdrop);
  const setCameraPreset = useStudioStore((s) => s.setCameraPreset);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  // Mobile bottom-sheet swipe-down-to-close state
  const [drawerDragY, setDrawerDragY] = useState(0);
  const [isDrawerDragging, setIsDrawerDragging] = useState(false);
  const swipeStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    fromScrollBody: boolean;
  }>({
    active: false,
    pointerId: null,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
    fromScrollBody: false,
  });

  useEffect(() => {
    if (!mobileDrawerOpen) {
      setDrawerDragY(0);
      setIsDrawerDragging(false);
      swipeStateRef.current.active = false;
    }
  }, [mobileDrawerOpen]);

  const finishDrawerSwipe = (currentOffset: number) => {
    const velocity = swipeStateRef.current.velocity;
    swipeStateRef.current.active = false;
    swipeStateRef.current.pointerId = null;
    setIsDrawerDragging(false);

    if (shouldDismissDrawerOnRelease(currentOffset, velocity)) {
      setDrawerDragY(0);
      setMobileDrawerOpen(false);
    } else {
      setDrawerDragY(0);
    }
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobileDrawerOpen) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) return;
    // Allow normal button clicks (e.g., Done button) without hijacking
    if ((e.target as HTMLElement).closest('button')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const now = performance.now();
    swipeStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastTime: now,
      velocity: 0,
      fromScrollBody: false,
    };
    setIsDrawerDragging(true);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = swipeStateRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;

    const now = performance.now();
    const dt = Math.max(1, now - st.lastTime);
    const instVel = (e.clientY - st.lastY) / dt;
    st.velocity = st.velocity * 0.4 + instVel * 0.6;
    st.lastY = e.clientY;
    st.lastTime = now;

    setDrawerDragY(computeDrawerDragOffset(e.clientY - st.startY));
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = swipeStateRef.current;
    if (!st.active || st.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer already released
    }
    const finalOffset = computeDrawerDragOffset(e.clientY - st.startY);
    finishDrawerSwipe(finalOffset);
  };

  // Also allow natural pull-down-to-close from the top of the scrollable body on touch screens
  const handleBodyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!mobileDrawerOpen || e.touches.length !== 1) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) return;
    const scrollEl = scrollBodyRef.current;
    if (!scrollEl || scrollEl.scrollTop > 2) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [data-testid^="artboard-preview-"]')) {
      return;
    }

    const touch = e.touches[0];
    const now = performance.now();
    swipeStateRef.current = {
      active: true,
      pointerId: null,
      startY: touch.clientY,
      lastY: touch.clientY,
      lastTime: now,
      velocity: 0,
      fromScrollBody: true,
    };
  };

  const handleBodyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const st = swipeStateRef.current;
    if (!st.active || !st.fromScrollBody || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - st.startY;

    if (deltaY <= 0) {
      // User is scrolling downward through content — yield cleanly to native scroll
      if (!isDrawerDragging) {
        st.active = false;
        return;
      }
      setDrawerDragY(computeDrawerDragOffset(deltaY));
      return;
    }

    const scrollEl = scrollBodyRef.current;
    if (scrollEl && scrollEl.scrollTop > 2) {
      st.active = false;
      return;
    }

    const now = performance.now();
    const dt = Math.max(1, now - st.lastTime);
    const instVel = (touch.clientY - st.lastY) / dt;
    st.velocity = st.velocity * 0.4 + instVel * 0.6;
    st.lastY = touch.clientY;
    st.lastTime = now;

    if (!isDrawerDragging && deltaY > 8) {
      setIsDrawerDragging(true);
    }
    if (deltaY > 8) {
      setDrawerDragY(computeDrawerDragOffset(deltaY));
    }
  };

  const handleBodyTouchEnd = () => {
    const st = swipeStateRef.current;
    if (!st.active || !st.fromScrollBody) return;
    finishDrawerSwipe(drawerDragY);
  };

  const currentLayerId: LayerId | null =
    activeTab === 'finish' || activeTab === 'presets' ? null : (activeTab as LayerId);
  const currentLayer = currentLayerId ? layers[currentLayerId] : null;

  const handleTabChange = (tab: SidebarTabId) => {
    setActiveTab(tab);
    if (tab === 'front') setCameraPreset('front');
    else if (tab === 'back') setCameraPreset('back');
    else if (tab === 'lanyard') setCameraPreset('full');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentLayerId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLayerUpload(currentLayerId, reader.result, file.name);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const backdropAlpha = computeBackdropOpacity(
    drawerDragY,
    asideRef.current?.offsetHeight || 560
  );

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden transition-opacity duration-150"
          style={{ opacity: isDrawerDragging ? backdropAlpha : 1 }}
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={asideRef}
        data-testid="studio-sidebar-drawer"
        data-drawer-open={mobileDrawerOpen ? 'true' : 'false'}
        style={
          mobileDrawerOpen && (isDrawerDragging || drawerDragY !== 0)
            ? { transform: `translateY(${drawerDragY}px)` }
            : undefined
        }
        className={`fixed inset-x-0 bottom-0 z-40 flex flex-col bg-zinc-900/98 border-t border-white/15 rounded-t-3xl max-h-[82dvh] ${
          isDrawerDragging ? 'transition-none' : 'transition-transform duration-200 ease-out'
        } lg:static lg:inset-auto lg:w-[360px] lg:shrink-0 lg:h-full lg:max-h-none lg:rounded-none lg:border-t-0 lg:border-r lg:border-white/10 lg:bg-zinc-900/95 lg:translate-y-0 lg:z-20 ${
          mobileDrawerOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'
        }`}
        aria-label="Design and Material Studio Controls"
      >
        {/* Mobile Swipe-Down Drag Handle + Header Zone */}
        <div
          data-testid="mobile-drawer-handle"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerUp}
          className="shrink-0 touch-none lg:touch-auto cursor-grab active:cursor-grabbing lg:cursor-default select-none"
        >
          {/* Mobile Grab Handle */}
          <div
            className="lg:hidden flex flex-col items-center pt-2.5 pb-1"
            aria-label="Swipe down to close design menu"
          >
            <div className="w-11 h-1.5 rounded-full bg-white/25" />
          </div>

          {/* Clean Studio Header */}
          <header className="px-5 py-3 lg:py-4 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight text-zinc-100 whitespace-nowrap">
                BadgeForge 3D
              </h1>
              <p className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                CR80 5.4×8.56 cm · Lanyard 80×2 cm
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              className="lg:hidden min-h-[40px] px-3.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white whitespace-nowrap shrink-0"
            >
              Done
            </button>
          </header>
        </div>

        {/* 5-Tab Navigation Bar */}
        <div
          role="tablist"
          aria-label="Customization layers"
          className="grid grid-cols-5 gap-1 p-2 border-b border-white/10 bg-[#0d1016] shrink-0"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(tab.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] py-2 px-1 rounded-lg text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-400/40'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="text-[11px] font-semibold leading-tight whitespace-nowrap">
                  {tab.label}
                </span>
                <span className="text-[9px] font-mono tabular-nums opacity-70 mt-0.5 whitespace-nowrap">
                  {tab.spec}
                </span>
              </button>
            );
          })}
        </div>

      {/* Scrollable Editor Body (also supports pull-down-to-close from scrollTop === 0 on mobile) */}
      <div
        ref={scrollBodyRef}
        onTouchStart={handleBodyTouchStart}
        onTouchMove={handleBodyTouchMove}
        onTouchEnd={handleBodyTouchEnd}
        onTouchCancel={handleBodyTouchEnd}
        className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5"
      >
        {activeTab === 'presets' ? (
          <PresetsPanel />
        ) : currentLayerId && currentLayer ? (
          <>
            {/* Interactive 2D Ruler & Safe-Zone Artboard */}
            <ArtboardPreview layerId={currentLayerId} />

            {/* File Upload / Clear Artwork */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-200">Artwork Image</h2>
                {currentLayer.uploadedImageUrl && (
                  <button
                    type="button"
                    onClick={() => setLayerUpload(currentLayerId, null, null)}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Use template
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleFileChange}
                className="hidden"
                aria-label={`Upload ${currentLayerId} artwork image`}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-dashed border-white/20 bg-white/[0.03] hover:bg-indigo-500/10 hover:border-indigo-400/50 text-xs font-medium text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-400" />
                <span className="truncate">
                  {currentLayer.uploadedFileName
                    ? `Replace: ${currentLayer.uploadedFileName}`
                    : `Upload ${
                        currentLayerId === 'lanyard'
                          ? 'Lanyard Banner / Logo'
                          : `${currentLayerId === 'front' ? 'Front' : 'Back'} Design`
                      } (PNG, JPG, SVG)`}
                </span>
              </button>
            </section>

            {/* 2D Transform Controls */}
            <section className="space-y-3.5 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  2D Fit & Transform
                </h2>
                <button
                  type="button"
                  onClick={() => resetLayerTransform(currentLayerId)}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>

              {/* Fit Mode Segmented Control */}
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#090b0f] border border-white/10">
                {(['cover', 'contain', 'stretch'] as FitMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateLayer(currentLayerId, { fitMode: mode })}
                    className={`py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                      currentLayer.fitMode === mode
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* Scale Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`scale-${currentLayerId}`} className="text-zinc-400">
                    Scale
                  </label>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {Math.round(currentLayer.scale * 100)}%
                  </span>
                </div>
                <input
                  id={`scale-${currentLayerId}`}
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.02}
                  value={currentLayer.scale}
                  onChange={(e) =>
                    updateLayer(currentLayerId, { scale: parseFloat(e.target.value) })
                  }
                  className="w-full studio-slider"
                />
              </div>

              {/* Offset X & Y Sliders */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`offsetx-${currentLayerId}`} className="text-zinc-400">
                      Offset X
                    </label>
                    <span className="font-mono tabular-nums text-zinc-300">
                      {Math.round(currentLayer.offsetX * 100)}%
                    </span>
                  </div>
                  <input
                    id={`offsetx-${currentLayerId}`}
                    type="range"
                    min={-0.6}
                    max={0.6}
                    step={0.01}
                    value={currentLayer.offsetX}
                    onChange={(e) =>
                      updateLayer(currentLayerId, { offsetX: parseFloat(e.target.value) })
                    }
                    className="w-full studio-slider"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`offsety-${currentLayerId}`} className="text-zinc-400">
                      Offset Y
                    </label>
                    <span className="font-mono tabular-nums text-zinc-300">
                      {Math.round(currentLayer.offsetY * 100)}%
                    </span>
                  </div>
                  <input
                    id={`offsety-${currentLayerId}`}
                    type="range"
                    min={-0.6}
                    max={0.6}
                    step={0.01}
                    value={currentLayer.offsetY}
                    onChange={(e) =>
                      updateLayer(currentLayerId, { offsetY: parseFloat(e.target.value) })
                    }
                    className="w-full studio-slider"
                  />
                </div>
              </div>

              {/* Rotation Steps */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-zinc-500" />
                  Rotation
                </span>
                <div className="flex items-center gap-1">
                  {([0, 90, 180, 270] as const).map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => updateLayer(currentLayerId, { rotation: deg })}
                      className={`px-2.5 py-1 text-[11px] font-mono tabular-nums rounded-md border transition-colors ${
                        currentLayer.rotation === deg
                          ? 'bg-indigo-600/25 border-indigo-400/60 text-indigo-200'
                          : 'bg-[#090b0f] border-white/10 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              {/* Lanyard Pattern Repeat Control */}
              {currentLayerId === 'lanyard' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="lanyard-repeat" className="text-zinc-400">
                      Logo Pattern Repeat (80 cm loop)
                    </label>
                    <span className="font-mono tabular-nums text-zinc-200">
                      {currentLayer.lanyardRepeat}×
                    </span>
                  </div>
                  <input
                    id="lanyard-repeat"
                    type="range"
                    min={1}
                    max={8}
                    step={1}
                    value={currentLayer.lanyardRepeat}
                    onChange={(e) =>
                      updateLayer('lanyard', { lanyardRepeat: parseInt(e.target.value, 10) })
                    }
                    className="w-full studio-slider"
                  />
                </div>
              )}

              {/* Background Fill Color */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`bg-color-${currentLayerId}`} className="text-zinc-400">
                    Base / Transparent Fill
                  </label>
                  <span className="font-mono text-[11px] text-zinc-300 uppercase">
                    {currentLayer.backgroundColor}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id={`bg-color-${currentLayerId}`}
                    type="color"
                    value={currentLayer.backgroundColor}
                    onChange={(e) =>
                      updateLayer(currentLayerId, { backgroundColor: e.target.value })
                    }
                    className="w-8 h-7 rounded cursor-pointer bg-transparent border border-white/15"
                  />
                  <div className="flex items-center gap-1.5">
                    {BG_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Set fill color ${hex}`}
                        onClick={() => updateLayer(currentLayerId, { backgroundColor: hex })}
                        className={`w-6 h-6 rounded-md border transition-transform hover:scale-105 ${
                          currentLayer.backgroundColor.toLowerCase() === hex
                            ? 'border-indigo-400 ring-1 ring-indigo-400'
                            : 'border-white/20'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Built-in Sample Templates */}
            <section className="space-y-2.5 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  Quick Sample Templates
                </h2>
                <span className="text-[11px] text-zinc-500">300 DPI</span>
              </div>

              <div className="space-y-2">
                {TEMPLATES.map((tpl) => {
                  const isSelected = activeTemplate === tpl.id && !currentLayer.uploadedImageUrl;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-600/15 border-indigo-400/50 text-zinc-100'
                          : 'bg-[#0c0f15] border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{tpl.name}</div>
                        <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {tpl.subtitle}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
                        {tpl.swatches.map((color, idx) => (
                          <span
                            key={idx}
                            className="w-3.5 h-3.5 rounded-sm border border-white/20"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          /* FINISH & FX TAB */
          <div className="space-y-5">
            {/* Protective Badge Holder / Case Option */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                    Protective Badge Case
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Rigid framed holder with clear polycarbonate window
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cardCaseEnabled}
                  aria-label="Toggle protective badge case"
                  onClick={() => setCardCaseEnabled(!cardCaseEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    cardCaseEnabled ? 'bg-indigo-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      cardCaseEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {cardCaseEnabled && (
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'matte-obsidian', label: 'Matte Obsidian', color: '#1b1e26' },
                      { id: 'frosted-clear', label: 'Frosted Clear', color: '#cbd5e1' },
                      { id: 'glacier-white', label: 'Glacier White', color: '#f1f5f9' },
                      { id: 'slate-aluminum', label: 'Anodized Alloy', color: '#b8c2d1' },
                      { id: 'cobalt-frame', label: 'Cobalt Frame', color: '#1d4ed8' },
                    ] as Array<{ id: CardCaseStyle; label: string; color: string }>
                  ).map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setCardCaseStyle(style.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-colors ${
                        cardCaseStyle === style.id
                          ? 'bg-indigo-600/20 border-indigo-400/50 text-zinc-100'
                          : 'bg-[#0b0e14] border-white/10 text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-sm border border-white/25 shrink-0"
                        style={{ backgroundColor: style.color }}
                      />
                      <span className="truncate">{style.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Card PVC Surface Finish */}
            <section className="space-y-2.5 pt-3 border-t border-white/10">
              <h2 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                PVC Surface Finish
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: 'glossy',
                      label: 'Glossy Laminated',
                      detail: 'Clearcoat 0.90 · IOR 1.52',
                    },
                    {
                      id: 'matte',
                      label: 'Matte Frosted',
                      detail: 'Roughness 0.58 · Soft sheen',
                    },
                  ] as Array<{ id: CardFinish; label: string; detail: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCardFinish(item.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      cardFinish === item.id
                        ? 'bg-indigo-600/20 border-indigo-400/50 text-zinc-100'
                        : 'bg-[#0b0e14] border-white/10 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="text-[10px] font-mono text-zinc-400 mt-1">{item.detail}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* PVC Core Edge Color */}
            <section className="space-y-2.5 pt-3 border-t border-white/10">
              <h2 className="text-xs font-semibold text-zinc-200">PVC Core Edge (30 mil)</h2>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'white', label: 'White Core', color: '#f4f4f6' },
                    { id: 'black', label: 'Black Core', color: '#141417' },
                    { id: 'gold', label: 'Metallic Gold', color: '#d4af37' },
                    { id: 'silver', label: 'Metallic Silver', color: '#d4d8df' },
                  ] as Array<{ id: EdgeMaterialPreset; label: string; color: string }>
                ).map((edge) => (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => setEdgePreset(edge.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                      edgePreset === edge.id
                        ? 'bg-indigo-600/20 border-indigo-400/50 text-zinc-100'
                        : 'bg-[#0b0e14] border-white/10 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-sm border border-white/25 shrink-0"
                      style={{ backgroundColor: edge.color }}
                    />
                    <span className="truncate">{edge.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Holographic Security Foil Overlay */}
            <section className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Holographic Security Foil
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Thin-film iridescent micro-guilloché & seal
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hologramEnabled}
                  aria-label="Toggle holographic security foil"
                  onClick={() => setHologramEnabled(!hologramEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    hologramEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      hologramEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {hologramEnabled && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="holo-intensity" className="text-zinc-400">
                      Foil Refraction Strength
                    </label>
                    <span className="font-mono tabular-nums text-zinc-200">
                      {Math.round(hologramIntensity * 100)}%
                    </span>
                  </div>
                  <input
                    id="holo-intensity"
                    type="range"
                    min={0.2}
                    max={1.0}
                    step={0.02}
                    value={hologramIntensity}
                    onChange={(e) => setHologramIntensity(parseFloat(e.target.value))}
                    className="w-full studio-slider"
                  />
                </div>
              )}
            </section>

            {/* Metallic Clasp Hardware Finish */}
            <section className="space-y-2.5 pt-3 border-t border-white/10">
              <h2 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Clasp & Crimp Metal
              </h2>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'brushed-steel', label: 'Steel', color: '#d8dde6' },
                    { id: 'matte-black', label: 'Black', color: '#27292e' },
                    { id: 'champagne-gold', label: 'Gold', color: '#dfb864' },
                  ] as Array<{ id: HardwareFinish; label: string; color: string }>
                ).map((hw) => (
                  <button
                    key={hw.id}
                    type="button"
                    onClick={() => setHardwareFinish(hw.id)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-xs font-medium transition-colors ${
                      hardwareFinish === hw.id
                        ? 'bg-indigo-600/20 border-indigo-400/50 text-zinc-100'
                        : 'bg-[#0b0e14] border-white/10 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-white/25"
                      style={{ backgroundColor: hw.color }}
                    />
                    <span>{hw.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Studio Environment Backdrop */}
            <section className="space-y-2.5 pt-3 border-t border-white/10">
              <h2 className="text-xs font-semibold text-zinc-200">Studio Backdrop</h2>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'obsidian', label: 'Obsidian', hex: '#0b0d10' },
                    { id: 'slate', label: 'Slate', hex: '#141821' },
                    { id: 'studio-light', label: 'Studio Light', hex: '#e6e8ee' },
                  ] as const
                ).map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setStudioBackdrop(bg.id)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-colors ${
                      studioBackdrop === bg.id
                        ? 'bg-indigo-600/20 border-indigo-400/50 text-zinc-100'
                        : 'bg-[#0b0e14] border-white/10 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <span
                      className="w-full h-5 rounded border border-white/20"
                      style={{ backgroundColor: bg.hex }}
                    />
                    <span className="whitespace-nowrap text-[11px]">{bg.label}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
