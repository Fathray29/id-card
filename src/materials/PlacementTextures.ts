import * as THREE from 'three';

export interface ProceduralSurfaceMaps {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  dispose: () => void;
}

function configureMap(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  isColor: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface PbrWoodMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  dispose: () => void;
}

export type WoodTextureVariant = 'dark-walnut' | 'cathedral-walnut';

/**
 * Loads photorealistic CC0 Poly Haven 1K walnut wood PBR maps (diffuse, OpenGL normal, roughness)
 * stored locally in `/textures/wood/` for zero network latency and authentic wood pores/grain.
 */
export function loadWalnutWoodPbrMaps(
  variant: WoodTextureVariant,
  maxAnisotropy = 4,
  repeatX = 1.6,
  repeatY = 1.2,
  onLoad?: () => void
): PbrWoodMaps {
  const prefix =
    variant === 'cathedral-walnut'
      ? '/textures/wood/walnut_table'
      : '/textures/wood/dark_walnut';

  const loader = new THREE.TextureLoader();

  const configureLoaded = (tex: THREE.Texture, isColor: boolean): THREE.Texture => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  };

  const map = configureLoaded(loader.load(`${prefix}_diff.jpg`, () => onLoad?.()), true);
  const normalMap = configureLoaded(loader.load(`${prefix}_nor.jpg`, () => onLoad?.()), false);
  const roughnessMap = configureLoaded(
    loader.load(`${prefix}_rough.jpg`, () => onLoad?.()),
    false
  );

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates fine heather-charcoal woven tailor's linen texture maps for the mannequin torso bust.
 */
export function createLinenFabricMaps(
  maxAnisotropy = 4,
  repeatX = 5,
  repeatY = 5
): ProceduralSurfaceMaps {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = roughCanvas.width = size;
  colorCanvas.height = bumpCanvas.height = roughCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const cImg = cCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = Math.sin((x / size) * 42 * Math.PI * 2) * 0.5 + 0.5;
      const weft = Math.sin((y / size) * 42 * Math.PI * 2) * 0.5 + 0.5;
      const checker = ((Math.floor(x / 3) + Math.floor(y / 3)) & 1) === 0 ? warp : weft;
      const slub = Math.sin((x * 0.08 + y * 0.31)) * 0.5 + 0.5;
      const weave = checker * 0.75 + slub * 0.25;

      // Tailored warm heather slate linen (#4e5561 -> #6a7382) for crisp weave readability
      const base = 74 + weave * 30;
      const idx = (y * size + x) * 4;
      cImg.data[idx] = Math.round(base);
      cImg.data[idx + 1] = Math.round(base + 5);
      cImg.data[idx + 2] = Math.round(base + 12);
      cImg.data[idx + 3] = 255;

      const bump = Math.round(100 + weave * 110);
      bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bump;
      bImg.data[idx + 3] = 255;

      const rough = Math.round(215 + (1 - weave) * 32);
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = configureMap(colorCanvas, repeatX, repeatY, true, maxAnisotropy);
  const bumpMap = configureMap(bumpCanvas, repeatX, repeatY, false, maxAnisotropy);
  const roughnessMap = configureMap(roughCanvas, repeatX, repeatY, false, maxAnisotropy);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Generates matte anthracite wool-felt desk mat texture maps.
 */
export function createDeskMatMaps(
  maxAnisotropy = 4,
  repeatX = 4,
  repeatY = 3
): ProceduralSurfaceMaps {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = roughCanvas.width = size;
  colorCanvas.height = bumpCanvas.height = roughCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const cImg = cCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = nextRand();
      const wool = Math.sin(x * 0.25 + y * 0.17) * 0.15 + n * 0.85;
      const base = 30 + wool * 14;
      const idx = (y * size + x) * 4;
      cImg.data[idx] = Math.round(base);
      cImg.data[idx + 1] = Math.round(base + 2);
      cImg.data[idx + 2] = Math.round(base + 6);
      cImg.data[idx + 3] = 255;

      const bump = Math.round(110 + wool * 60);
      bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = bump;
      bImg.data[idx + 3] = 255;

      const rough = Math.round(225 + (1 - wool) * 24);
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = configureMap(colorCanvas, repeatX, repeatY, true, maxAnisotropy);
  const bumpMap = configureMap(bumpCanvas, repeatX, repeatY, false, maxAnisotropy);
  const roughnessMap = configureMap(roughCanvas, repeatX, repeatY, false, maxAnisotropy);

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}
