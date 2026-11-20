/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { StudioScene } from './components/canvas/StudioScene';
import { SidebarEditor } from './components/ui/SidebarEditor';
import { FloatingDock } from './components/ui/FloatingDock';
import { ExportModal } from './components/ui/ExportModal';
import { useStudioStore } from './store/useStudioStore';

export default function App() {
  const activeTemplate = useStudioStore((s) => s.activeTemplate);
  const cameraPreset = useStudioStore((s) => s.cameraPreset);
  const isFlipped = useStudioStore((s) => s.isFlipped);
  const showLanyard = useStudioStore((s) => s.showLanyard);
  const hologramEnabled = useStudioStore((s) => s.hologramEnabled);
  const previewReel = useStudioStore((s) => s.previewReel);

  // Studio keyboard shortcuts (1-4 camera presets, R preview cinematic reel, F flip, Space spin)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const store = useStudioStore.getState();
      if (store.exportModalOpen) return;

      if (e.key === '1') store.setCameraPreset('full');
      else if (e.key === '2') store.setCameraPreset('front');
      else if (e.key === '3') store.setCameraPreset('back');
      else if (e.key === '4') store.setCameraPreset('macro');
      else if (e.key.toLowerCase() === 'r') store.togglePreviewReel();
      else if (e.key.toLowerCase() === 'f') store.toggleFlip();
      else if (e.code === 'Space') {
        e.preventDefault();
        store.toggleAutoSpin();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="flex w-screen h-[100dvh] overflow-hidden bg-[#0B0D10] text-zinc-100"
      data-template={activeTemplate}
      data-camera={cameraPreset}
      data-flipped={isFlipped ? 'true' : 'false'}
      data-lanyard={showLanyard ? 'visible' : 'hidden'}
      data-hologram={hologramEnabled ? 'on' : 'off'}
      data-reel={previewReel ? 'playing' : 'idle'}
    >
      {/* Left 360px Sidebar on Desktop / Slide-Up Bottom Sheet Drawer on Mobile */}
      <SidebarEditor />

      {/* Full-Screen 3D Viewport + Responsive Floating Controls */}
      <main className="relative flex-1 min-w-0 h-full overflow-hidden">
        <StudioScene />
        <FloatingDock />
      </main>

      {/* Deterministic Offline Render Progress & Configuration Modal */}
      <ExportModal />
    </div>
  );
}
