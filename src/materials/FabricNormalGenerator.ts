import * as THREE from 'three';

export interface FabricMaps {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  dispose: () => void;
}

/**
 * Generates procedural 256x256 tileable woven polyester / ribbed twill normal & roughness maps.
 * Kept strictly in linear color space (THREE.NoColorSpace) as required for PBR data maps.
 */
export function createFabricMaps(maxAnisotropy = 8): FabricMaps {
  const size = 256;

  // Height field for crisp 2x2 diagonal ribbed twill polyester weave
  const height = new Float32Array(size * size);
  const weaveFreq = 32; // 32 threads per 256px tile

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * weaveFreq;
      const v = (y / size) * weaveFreq;

      // Warp & weft sinusoidal fibers
      const warp = Math.sin(u * Math.PI * 2);
      const weft = Math.sin(v * Math.PI * 2);

      // Diagonal twill over/under cadence (2-up, 2-down twill)
      const twillPhase = ((Math.floor(u) + Math.floor(v)) % 4 + 4) % 4;
      const isWarpTop = twillPhase < 2;

      const rib = isWarpTop
        ? 0.62 + 0.38 * Math.cos((u - Math.floor(u) - 0.5) * Math.PI)
        : 0.36 + 0.32 * Math.cos((v - Math.floor(v) - 0.5) * Math.PI);

      // Subtle micro-rib texture along fiber axis
      const micro = 0.08 * warp * weft;
      height[y * size + x] = Math.max(0, Math.min(1, rib + micro));
    }
  }

  // Convert height field -> tangent-space normal map canvas
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);

  // Also build calibrated roughness map (valleys rougher ~0.88, fiber crests slightly smoother ~0.68)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);

  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = height[y * size + xm];
      const hR = height[y * size + xp];
      const hU = height[ym * size + x];
      const hD = height[yp * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * size + x) * 4;
      nImg.data[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      nImg.data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      nImg.data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      nImg.data[idx + 3] = 255;

      const hVal = height[y * size + x];
      const roughByte = Math.round((0.9 - hVal * 0.24) * 255);
      rImg.data[idx] = roughByte;
      rImg.data[idx + 1] = roughByte;
      rImg.data[idx + 2] = roughByte;
      rImg.data[idx + 3] = 255;
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  // Strap is 2 cm wide (u) by 80 cm long (v) -> 1:40 physical tiling ratio for isotropic weave!
  normalMap.repeat.set(2, 80);
  normalMap.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 80);
  roughnessMap.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  roughnessMap.needsUpdate = true;

  return {
    normalMap,
    roughnessMap,
    dispose: () => {
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}
