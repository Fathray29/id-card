import * as THREE from 'three';

const HOLOGRAM_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const HOLOGRAM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  // Spectral thin-film iridescent palette (cyan -> violet/magenta -> warm gold)
  vec3 thinFilmSpectrum(float phase) {
    vec3 a = vec3(0.42, 0.46, 0.56);
    vec3 b = vec3(0.45, 0.42, 0.44);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.05, 0.38, 0.68);
    return clamp(a + b * cos(6.2831853 * (c * phase + d)), 0.0, 1.0);
  }

  // Procedural micro-guilloche wave lattice
  float guillochePattern(vec2 p) {
    float waveA = sin(p.x * 54.0 + sin(p.y * 18.0) * 2.2);
    float waveB = sin(p.y * 62.0 - cos(p.x * 16.0) * 2.4);
    float waveC = sin((p.x + p.y) * 44.0 + sin((p.x - p.y) * 20.0) * 1.5);
    float lines = smoothstep(0.76, 0.98, abs(waveA * waveB)) * 0.65
                + smoothstep(0.84, 0.99, abs(waveC)) * 0.45;
    return clamp(lines, 0.0, 1.0);
  }

  // Circular security seal emblem in bottom-right / upper-right security zone
  float securitySeal(vec2 uv, vec2 center, float radius) {
    vec2 d = (uv - center) * vec2(1.0, 1.585); // Aspect-corrected for 5.4 : 8.56
    float r = length(d);
    float angle = atan(d.y, d.x);

    // Outer scalloped rosette ring
    float rosetteRadius = radius * (1.0 + 0.065 * sin(angle * 18.0));
    float outerRing = smoothstep(0.011, 0.002, abs(r - rosetteRadius));
    float innerRing = smoothstep(0.009, 0.002, abs(r - radius * 0.66));

    // Radial sunburst rays inside the seal
    float rays = smoothstep(0.55, 0.95, cos(angle * 24.0))
               * smoothstep(radius * 0.25, radius * 0.35, r)
               * (1.0 - smoothstep(radius * 0.64, radius * 0.70, r));

    // Central diamond star
    float star = smoothstep(0.012, 0.002, abs(r - radius * (0.20 + 0.08 * cos(angle * 4.0))));

    // Fine concentric micro-rings
    float micro = smoothstep(0.82, 0.98, sin(r * 220.0))
                * (1.0 - smoothstep(radius * 0.92, radius * 1.02, r)) * 0.45;

    return clamp(outerRing + innerRing * 0.85 + rays * 0.6 + star + micro, 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    float ndotv = clamp(dot(N, V), 0.0, 1.0);

    // View-dependent Fresnel sheen & directional tilt phase
    float fresnel = pow(1.0 - ndotv, 1.85);
    float viewTilt = dot(V, vec3(0.68, 0.52, 0.0));
    float diagSweep = (vUv.x * 0.72 + vUv.y * 0.88) + viewTilt * 1.45 + uTime * 0.06;

    // Subtle specular diagonal foil band that glides across the card as it rotates
    float sheenBand = exp(-pow(fract(diagSweep * 0.55) - 0.5, 2.0) * 18.0);

    // Procedural security patterns
    float guilloche = guillochePattern(vUv);
    float sealPrimary = securitySeal(vUv, vec2(0.76, 0.78), 0.13);
    float sealSecondary = securitySeal(vUv, vec2(0.24, 0.25), 0.095);
    float microBorder = (
      smoothstep(0.03, 0.02, vUv.x) + smoothstep(0.97, 0.98, vUv.x) +
      smoothstep(0.022, 0.014, vUv.y) + smoothstep(0.978, 0.986, vUv.y)
    ) * 0.22;

    float mask = clamp(
      guilloche * 0.32 +
      sealPrimary * 0.95 +
      sealSecondary * 0.65 +
      sheenBand * 0.16 +
      microBorder,
      0.0,
      1.0
    );

    float phase = diagSweep * 0.95 + (1.0 - ndotv) * 1.35 + guilloche * 0.12;
    vec3 rainbow = thinFilmSpectrum(phase);

    // Metallic gold glint inside security seal
    vec3 goldTint = vec3(1.0, 0.86, 0.48);
    vec3 foilColor = mix(rainbow, mix(rainbow, goldTint, 0.35), sealPrimary);

    float angularResponse = 0.24 + 0.76 * clamp(fresnel * 1.45 + sheenBand * 0.85, 0.0, 1.0);
    float alpha = mask * angularResponse * uIntensity;

    gl_FragColor = vec4(foilColor * alpha, alpha);
  }
`;

export function createHologramMaterial(intensity = 0.72): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
    },
    vertexShader: HOLOGRAM_VERTEX_SHADER,
    fragmentShader: HOLOGRAM_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}
