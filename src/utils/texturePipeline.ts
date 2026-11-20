import * as THREE from 'three';
import type { LayerId, LayerTransform, SampleTemplateId } from '../store/useStudioStore';

/**
 * Studio 600-DPI master canvas resolutions for artifact-free 12MP stills & macro renders:
 * - Card Front & Back: 1296 x 2054 px (5.4 : 8.56 cm at ~610 DPI)
 * - Lanyard Strap:     4000 x 100 px  (80.0 : 2.0 cm = 40 : 1 ratio, <= 4096 GPU safe limit)
 */
export const LAYER_DIMENSIONS: Record<LayerId, { width: number; height: number }> = {
  front: { width: 1296, height: 2054 },
  back: { width: 1296, height: 2054 },
  lanyard: { width: 4000, height: 100 },
};

// Simple deterministic PRNG for crisp barcode / QR matrix generation
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawQrCode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fg: string,
  bg: string,
  seed: number
) {
  const cells = 21;
  const cell = size / cells;
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, x - 8, y - 8, size + 16, size + 16, 10);
  ctx.fill();

  const rand = seededRandom(seed);
  ctx.fillStyle = fg;

  const drawFinder = (cx: number, cy: number) => {
    ctx.fillRect(x + cx * cell, y + cy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = bg;
    ctx.fillRect(x + (cx + 1) * cell, y + (cy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = fg;
    ctx.fillRect(x + (cx + 2) * cell, y + (cy + 2) * cell, 3 * cell, 3 * cell);
  };

  drawFinder(0, 0);
  drawFinder(cells - 7, 0);
  drawFinder(0, cells - 7);

  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const inTopLeft = row < 8 && col < 8;
      const inTopRight = row < 8 && col >= cells - 8;
      const inBotLeft = row >= cells - 8 && col < 8;
      if (inTopLeft || inTopRight || inBotLeft) continue;
      if (rand() > 0.46) {
        ctx.fillRect(
          x + col * cell + 0.3,
          y + row * cell + 0.3,
          cell - 0.5,
          cell - 0.5
        );
      }
    }
  }
}

function drawBarcode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fg: string,
  seed: number
) {
  const rand = seededRandom(seed);
  ctx.fillStyle = fg;
  let cursor = x;
  while (cursor < x + w - 4) {
    const barW = rand() > 0.65 ? 5 : rand() > 0.35 ? 3 : 2;
    const gapW = rand() > 0.6 ? 4 : 2;
    if (cursor + barW <= x + w) {
      ctx.fillRect(cursor, y, barW, h);
    }
    cursor += barW + gapW;
  }
}

function drawStylizedPortrait(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  accentA: string,
  accentB: string,
  suitColor: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Studio portrait backdrop gradient
  const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  grad.addColorStop(0, accentA);
  grad.addColorStop(1, accentB);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Subtle rim halo behind silhouette
  const halo = ctx.createRadialGradient(cx, cy - radius * 0.15, radius * 0.1, cx, cy, radius);
  halo.addColorStop(0, 'rgba(255,255,255,0.28)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Shoulders / blazer
  ctx.fillStyle = suitColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.92, radius * 0.78, radius * 0.62, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Crisp inner collar V
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.22, cy + radius * 0.42);
  ctx.lineTo(cx, cy + radius * 0.74);
  ctx.lineTo(cx + radius * 0.22, cy + radius * 0.42);
  ctx.closePath();
  ctx.fill();

  // Neck
  ctx.fillStyle = '#d4a383';
  ctx.fillRect(cx - radius * 0.14, cy + radius * 0.22, radius * 0.28, radius * 0.3);

  // Head
  ctx.fillStyle = '#e5b899';
  ctx.beginPath();
  ctx.ellipse(cx, cy - radius * 0.06, radius * 0.31, radius * 0.37, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sculpted hair silhouette
  ctx.fillStyle = '#1e1b26';
  ctx.beginPath();
  ctx.ellipse(cx, cy - radius * 0.24, radius * 0.34, radius * 0.27, 0, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - radius * 0.22, cy - radius * 0.18, radius * 0.13, 0, Math.PI * 2);
  ctx.arc(cx + radius * 0.23, cy - radius * 0.18, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws crisp, print-grade 600-DPI vector-scaled procedural templates onto the target canvas.
 */
export function drawProceduralTemplate(
  ctx: CanvasRenderingContext2D,
  layerId: LayerId,
  template: SampleTemplateId,
  bgColor: string
) {
  const { width: w, height: h } = ctx.canvas;
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  if (layerId === 'lanyard') {
    const baseW = 2400;
    const baseH = 60;
    ctx.scale(w / baseW, h / baseH);
    drawLanyardTemplate(ctx, baseW, baseH, template, bgColor);
    ctx.restore();
    return;
  }

  const baseW = 648;
  const baseH = 1027;
  ctx.scale(w / baseW, h / baseH);

  if (template === 'tech-vip') {
    drawTechVipCard(ctx, baseW, baseH, layerId === 'front', bgColor);
  } else if (template === 'corporate-sec') {
    drawCorporateSecCard(ctx, baseW, baseH, layerId === 'front', bgColor);
  } else {
    drawMinimalStaffCard(ctx, baseW, baseH, layerId === 'front', bgColor);
  }
  ctx.restore();
}

function drawTechVipCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  isFront: boolean,
  bgColor: string
) {
  // Deep navy obsidian base
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, bgColor || '#0c1122');
  bgGrad.addColorStop(0.55, '#111834');
  bgGrad.addColorStop(1, '#090d1a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle geometric mesh arcs (kept below slot punch zone y=0..115px)
  ctx.save();
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.16)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.88, h * 0.24, 90 + i * 42, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Diagonal indigo/emerald accent ribbon
  const ribbon = ctx.createLinearGradient(0, h * 0.62, w, h * 0.78);
  ribbon.addColorStop(0, '#4f46e5');
  ribbon.addColorStop(0.55, '#6366f1');
  ribbon.addColorStop(1, '#10b981');
  ctx.fillStyle = ribbon;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.68);
  ctx.lineTo(w, h * 0.61);
  ctx.lineTo(w, h * 0.645);
  ctx.lineTo(0, h * 0.715);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (isFront) {
    // Top safe header below slot punch (slot punch center is at y ≈ 60px, bottom ≈ 78px)
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('MERIDIAN SUMMIT 2026', 48, 152);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('ALL-ACCESS', 48, 206);

    // Emerald VIP accent bar
    ctx.fillStyle = '#10b981';
    ctx.fillRect(48, 224, 88, 5);
    ctx.fillStyle = '#6ee7b7';
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.fillText('SPEAKER · VIP KEYNOTE', 150, 232);

    // Portrait frame
    ctx.save();
    ctx.strokeStyle = 'rgba(165, 180, 252, 0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w / 2, 415, 124, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawStylizedPortrait(ctx, w / 2, 415, 116, '#312e81', '#0f766e', '#1e293b');

    // Attendee Name & Role
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 42px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Elena Vance', w / 2, 600);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Principal Graphics Architect', w / 2, 636);

    ctx.textAlign = 'left';

    // Footer metadata block
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillText('SAN FRANCISCO · MOSCONE WEST', 48, 770);
    ctx.fillText('PASS ID: MRD-26-0842', 48, 800);
    ctx.fillText('ZONE: STAGE A · BACKSTAGE', 48, 830);

    // Bottom QR code
    drawQrCode(ctx, w - 188, 750, 134, '#0f172a', '#f8fafc', 2026);

    // Micro-text baseline
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.fillText('NOV 18–21, 2026  ·  NON-TRANSFERABLE', 48, 974);
  } else {
    // BACK SIDE
    // Magnetic stripe (CR80 standard top/side band below punch)
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 128, w, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 128, w, 2);
    ctx.fillRect(0, 200, w, 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('MERIDIAN SUMMIT 2026', 48, 274);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
    const lines = [
      'This credential grants full venue access,',
      'speaker greenroom entry, and press lounge',
      'privileges for the duration of the summit.',
      '',
      'Please keep this badge visible at all times.',
      'If found, return to Registration Desk A',
      'or call Event Security: +1 (415) 555-0194.',
    ];
    lines.forEach((line, idx) => {
      ctx.fillText(line, 48, 326 + idx * 32);
    });

    // Wi-Fi & Schedule Quick Card
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    drawRoundedRect(ctx, 48, 568, w - 96, 132, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#6ee7b7';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText('VENUE NETWORK', 72, 608);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText('SSID: Meridian-Speaker-5G', 72, 646);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '400 18px "JetBrains Mono", monospace';
    ctx.fillText('KEY:  M26-GRAPHICS-VIP', 72, 678);

    // Barcode strip
    ctx.fillStyle = '#f8fafc';
    drawRoundedRect(ctx, 48, 766, w - 96, 152, 14);
    ctx.fill();
    drawBarcode(ctx, 78, 788, w - 156, 86, '#090d1a', 90842);

    ctx.fillStyle = '#0f172a';
    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MRD-26-0842-9918-VANCE', w / 2, 902);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.fillText('ISO/IEC 7810 ID-1  ·  30 MIL PVC', 48, 974);
  }
}

function drawCorporateSecCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  isFront: boolean,
  bgColor: string
) {
  ctx.fillStyle = bgColor || '#f8fafc';
  ctx.fillRect(0, 0, w, h);

  // Clean architectural header banner
  ctx.fillStyle = '#0f2942';
  ctx.fillRect(0, 0, w, 240);
  // Subtle teal precision rule
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(0, 234, w, 8);

  if (isFront) {
    // Company emblem mark
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(48, 128, 22, 54);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(76, 146, 22, 36);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('NORTHSTAR', 116, 158);
    ctx.fillStyle = '#93c5fd';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText('AEROSPACE SYSTEMS', 116, 184);

    // Rounded rectangular photo block
    ctx.save();
    drawRoundedRect(ctx, w / 2 - 120, 290, 240, 270, 18);
    ctx.clip();
    drawStylizedPortrait(ctx, w / 2, 425, 145, '#e0f2fe', '#bae6fd', '#0f2942');
    ctx.restore();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, w / 2 - 120, 290, 240, 270, 18);
    ctx.stroke();

    // Name & Department
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = '700 40px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Marcus Chen', w / 2, 626);

    ctx.fillStyle = '#0369a1';
    ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Propulsion Systems Lead', w / 2, 662);

    // Clearance Strip
    ctx.fillStyle = '#0f2942';
    drawRoundedRect(ctx, 56, 706, w - 112, 64, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText('CLEARANCE LEVEL 3 · LABS', w / 2, 747);

    // Employee metadata
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText('EMP ID', 56, 822);
    ctx.fillText('ISSUED', 260, 822);
    ctx.fillText('EXPIRES', 450, 822);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText('NS-40912', 56, 852);
    ctx.fillText('01/2026', 260, 852);
    ctx.fillText('12/2028', 450, 852);

    // Bottom barcode
    drawBarcode(ctx, 56, 892, w - 112, 66, '#0f172a', 40912);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HQ CAMPUS · BUILDING 4 · SEATTLE WA', w / 2, 984);
    ctx.textAlign = 'left';
  } else {
    // BACK SIDE
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SECURITY NOTICE', 48, 178);

    // Magnetic stripe
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 274, w, 68);

    ctx.fillStyle = '#334155';
    ctx.font = '500 19px "Plus Jakarta Sans", sans-serif';
    const notice = [
      'Property of Northstar Aerospace Systems.',
      'Unauthorized duplication or transfer is',
      'strictly prohibited under corporate policy.',
      '',
      '24/7 Global Security Operations Center:',
      '+1 (206) 555-0148  ·  soc@northstar.aero',
    ];
    notice.forEach((line, idx) => {
      ctx.fillText(line, 48, 396 + idx * 34);
    });

    // Signature panel
    ctx.fillStyle = '#e2e8f0';
    drawRoundedRect(ctx, 48, 636, w - 96, 88, 10);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px "JetBrains Mono", monospace';
    ctx.fillText('AUTHORIZED SIGNATURE', 66, 662);

    // Stylized signature stroke
    ctx.strokeStyle = '#0f2942';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(74, 704);
    ctx.bezierCurveTo(130, 668, 165, 718, 224, 686);
    ctx.bezierCurveTo(268, 664, 310, 714, 385, 690);
    ctx.stroke();

    drawQrCode(ctx, 52, 772, 148, '#0f2942', '#ffffff', 40912);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillText('RFID / NFC ENABLED', 230, 816);
    ctx.fillStyle = '#475569';
    ctx.font = '400 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('13.56 MHz DESFire EV3', 230, 850);
    ctx.fillText('Tap at turnstile readers', 230, 880);
    ctx.fillText('ID: NS-40912-B4', 230, 912);
  }
}

function drawMinimalStaffCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  isFront: boolean,
  bgColor: string
) {
  ctx.fillStyle = bgColor || '#141416';
  ctx.fillRect(0, 0, w, h);

  // Warm gold architectural framing rule
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 30, 30, w - 60, h - 60, 24);
  ctx.stroke();

  if (isFront) {
    // Minimalist Atelier wordmark
    ctx.fillStyle = '#d4af37';
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.fillText('ATELIER KŌBŌ', 58, 164);

    ctx.fillStyle = '#71717a';
    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.fillText('TOKYO · ZÜRICH', 58, 192);

    // Subtle geometric crest
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(w - 92, 174, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 108, 174);
    ctx.lineTo(w - 76, 174);
    ctx.stroke();

    // Large architectural monogram / portrait
    drawStylizedPortrait(ctx, w / 2, 412, 118, '#27272a', '#18181b', '#09090b');
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, 412, 126, 0, Math.PI * 2);
    ctx.stroke();

    // Typography
    ctx.fillStyle = '#fafafa';
    ctx.textAlign = 'center';
    ctx.font = '600 42px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Sora Takahashi', w / 2, 608);

    ctx.fillStyle = '#d4af37';
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Industrial Design Director', w / 2, 646);

    // Hairline divider
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(110, 696, w - 220, 1.5);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 17px "JetBrains Mono", monospace';
    ctx.fillText('STUDIO ACCESS · ARCHIVE & LAB', w / 2, 744);
    ctx.fillText('MEMBER NO. AK-019', w / 2, 778);

    drawQrCode(ctx, w / 2 - 58, 822, 116, '#fafafa', '#18181b', 1919);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = '#09090b';
    ctx.fillRect(32, 146, w - 64, 64);

    ctx.fillStyle = '#d4af37';
    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.fillText('ATELIER KŌBŌ  ·  STAFF CREDENTIAL', 58, 286);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '400 19px "Plus Jakarta Sans", sans-serif';
    const copy = [
      'Aoyama Design District, Minato-ku',
      'Tokyo 107-0062, Japan',
      '',
      'Talstrasse 82, 8001 Zürich',
      'Switzerland',
      '',
      'studio@atelier-kobo.design',
    ];
    copy.forEach((line, idx) => {
      ctx.fillText(line, 58, 344 + idx * 34);
    });

    ctx.fillStyle = '#fafafa';
    drawRoundedRect(ctx, 58, 760, w - 116, 134, 12);
    ctx.fill();
    drawBarcode(ctx, 84, 782, w - 168, 74, '#141416', 19019);

    ctx.fillStyle = '#18181b';
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AK-019-TYO-ZRH-2026', w / 2, 878);
    ctx.textAlign = 'left';
  }
}

function drawLanyardTemplate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  template: SampleTemplateId,
  bgColor: string
) {
  // High-contrast dye-sublimated woven polyester base
  if (template === 'tech-vip') {
    const isDefaultBg = bgColor.toLowerCase() === '#1d2b8a' || bgColor.toLowerCase() === '#161b33';
    if (isDefaultBg) {
      // Vibrant multi-stop royal cobalt -> electric indigo -> deep violet -> teal energy ribbon
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0.0, '#1d4ed8');
      grad.addColorStop(0.25, '#4338ca');
      grad.addColorStop(0.5, '#6d28d9');
      grad.addColorStop(0.75, '#0f766e');
      grad.addColorStop(1.0, '#1d4ed8');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bgColor;
    }
    ctx.fillRect(0, 0, w, h);

    // Subtle high-contrast dark center track so white/neon typography pops sharply
    ctx.fillStyle = 'rgba(8, 12, 32, 0.34)';
    ctx.fillRect(0, 10, w, h - 20);

    // Vivid electric cyan & emerald woven top/bottom racing stripes
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 2, w, 4);
    ctx.fillStyle = '#34d399';
    ctx.fillRect(0, h - 6, w, 4);

    // Subtle stitched thread highlight inside the stripes
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(w, 8);
    ctx.moveTo(0, h - 8);
    ctx.lineTo(w, h - 8);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (template === 'corporate-sec') {
    const isDefaultBg = bgColor.toLowerCase() === '#0369a1' || bgColor.toLowerCase() === '#0f2942';
    if (isDefaultBg) {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(0.5, '#1d4ed8');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bgColor;
    }
    ctx.fillRect(0, 0, w, h);

    // Crisp bright cyan & pure white edge piping
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(0, 2, w, 4);
    ctx.fillRect(0, h - 6, w, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(0, 8, w, 1.5);
    ctx.fillRect(0, h - 9.5, w, 1.5);
  } else {
    // Minimalist obsidian & luminous champagne-gold weave
    ctx.fillStyle = bgColor || '#111115';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#f5c542';
    ctx.fillRect(0, 3, w, 3.5);
    ctx.fillRect(0, h - 6.5, w, 3.5);
  }

  // Repeating high-contrast brand graphics along the 80cm strap (2400 x 60 px)
  const repeatCount = 8;
  const step = w / repeatCount;

  ctx.textBaseline = 'middle';
  for (let i = 0; i < repeatCount; i++) {
    const startX = i * step + 20;
    if (template === 'tech-vip') {
      // Bright emerald-to-cyan diamond emblem
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(startX, h / 2);
      ctx.lineTo(startX + 10, h / 2 - 10);
      ctx.lineTo(startX + 20, h / 2);
      ctx.lineTo(startX + 10, h / 2 + 10);
      ctx.closePath();
      ctx.fill();

      // Inner white core glint
      ctx.fillStyle = '#ecfeff';
      ctx.beginPath();
      ctx.moveTo(startX + 6, h / 2);
      ctx.lineTo(startX + 10, h / 2 - 4);
      ctx.lineTo(startX + 14, h / 2);
      ctx.lineTo(startX + 10, h / 2 + 4);
      ctx.closePath();
      ctx.fill();

      // Crisp pure white bold wordmark with subtle dark shadow for high readability
      ctx.save();
      ctx.shadowColor = 'rgba(5, 8, 22, 0.75)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 23px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('MERIDIAN 2026', startX + 30, h / 2 + 1);
      ctx.restore();

      // Vibrant cyan-emerald VIP pill tag
      ctx.fillStyle = '#10b981';
      drawRoundedRect(ctx, startX + 216, h / 2 - 12, 52, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#041214';
      ctx.font = '800 15px "JetBrains Mono", monospace';
      ctx.fillText('VIP', startX + 228, h / 2 + 1);
    } else if (template === 'corporate-sec') {
      // Dual crisp geometric emblem bars
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(startX, h / 2 - 10, 7, 20);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(startX + 10, h / 2 - 5, 7, 15);

      ctx.save();
      ctx.shadowColor = 'rgba(2, 18, 42, 0.65)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('NORTHSTAR AERO', startX + 28, h / 2 + 1);
      ctx.restore();
    } else {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(startX + 10, h / 2, 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 21px "JetBrains Mono", monospace';
      ctx.fillText('ATELIER KŌBŌ', startX + 32, h / 2 + 1);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 15px "JetBrains Mono", monospace';
      ctx.fillText('TOKYO', startX + 212, h / 2 + 1);
    }
  }
}

/**
 * Compiles a layer (either user-uploaded image with fit/scale/offset/rotation transforms
 * or the built-in procedural template) onto an offscreen 2D canvas.
 */
export function renderLayerToCanvas(
  canvas: HTMLCanvasElement,
  layerId: LayerId,
  transform: LayerTransform,
  template: SampleTemplateId,
  loadedImage: HTMLImageElement | null
): void {
  const dims = LAYER_DIMENSIONS[layerId];
  if (canvas.width !== dims.width || canvas.height !== dims.height) {
    canvas.width = dims.width;
    canvas.height = dims.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (!loadedImage) {
    // Draw built-in procedural artwork and apply transform if user adjusted scale/offset/rotation
    const isIdentity =
      transform.scale === 1 &&
      transform.offsetX === 0 &&
      transform.offsetY === 0 &&
      transform.rotation === 0 &&
      transform.lanyardRepeat === 1;

    if (isIdentity) {
      drawProceduralTemplate(ctx, layerId, template, transform.backgroundColor);
      return;
    }

    // Render template to temp canvas so user transforms apply seamlessly even on sample art
    const temp = document.createElement('canvas');
    temp.width = dims.width;
    temp.height = dims.height;
    const tctx = temp.getContext('2d');
    if (tctx) {
      drawProceduralTemplate(tctx, layerId, template, transform.backgroundColor);
      drawImageWithTransform(ctx, temp, layerId, transform);
    }
    return;
  }

  drawImageWithTransform(ctx, loadedImage, layerId, transform);
}

function drawImageWithTransform(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  layerId: LayerId,
  transform: LayerTransform
) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const sw = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
  const sh = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;

  // Fill background color (for transparent PNGs or contain letterboxing)
  ctx.save();
  ctx.fillStyle = transform.backgroundColor;
  ctx.fillRect(0, 0, cw, ch);

  if (sw <= 0 || sh <= 0) {
    ctx.restore();
    return;
  }

  // Handle repeating logo/pattern tiles across 80cm lanyard
  const repeats = layerId === 'lanyard' ? Math.max(1, Math.round(transform.lanyardRepeat)) : 1;
  const tileW = cw / repeats;

  const isQuarterTurn = transform.rotation === 90 || transform.rotation === 270;
  const effW = isQuarterTurn ? sh : sw;
  const effH = isQuarterTurn ? sw : sh;

  let drawW = tileW;
  let drawH = ch;

  if (transform.fitMode === 'cover') {
    const ratio = Math.max(tileW / effW, ch / effH);
    drawW = sw * ratio;
    drawH = sh * ratio;
  } else if (transform.fitMode === 'contain') {
    const ratio = Math.min(tileW / effW, ch / effH);
    drawW = sw * ratio;
    drawH = sh * ratio;
  } else {
    // stretch
    drawW = isQuarterTurn ? ch : tileW;
    drawH = isQuarterTurn ? tileW : ch;
  }

  drawW *= transform.scale;
  drawH *= transform.scale;

  const rad = (transform.rotation * Math.PI) / 180;
  const ox = transform.offsetX * tileW;
  const oy = transform.offsetY * ch;

  for (let i = 0; i < repeats; i++) {
    ctx.save();
    const cx = i * tileW + tileW / 2 + ox;
    const cy = ch / 2 + oy;

    // Clip each tile segment cleanly for lanyards
    if (repeats > 1) {
      ctx.beginPath();
      ctx.rect(i * tileW, 0, tileW, ch);
      ctx.clip();
    }

    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Configures a THREE.CanvasTexture with calibrated SRGB color space,
 * anisotropic filtering, and mipmap settings.
 */
export function createConfiguredCanvasTexture(
  canvas: HTMLCanvasElement,
  layerId: LayerId,
  maxAnisotropy = 16
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  if (layerId === 'lanyard') {
    // Strap U is across 2cm width (left->right), V is along 80cm loop (bottom->top).
    // Rotating the horizontal 2400x60 canvas by +90 deg maps (s'=v, t'=1-u) so text reads upright and un-mirrored.
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI / 2;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }

  tex.needsUpdate = true;
  return tex;
}
