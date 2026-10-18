import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from 'three';

/**
 * Dégradé vertical (zénith sombre → couleur du thème à l'horizon), en fond d'écran plat.
 * Beaucoup plus économique qu'un dôme 3D : une simple texture 2D assignée à scene.background.
 */
export function createSkyTexture(horizon: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const h = new Color(horizon);
  const zenith = h.clone().multiplyScalar(0.25).lerp(new Color(0x000000), 0.35);
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, `#${zenith.getHexString()}`);
  grad.addColorStop(0.65, `#${h.getHexString()}`);
  grad.addColorStop(1, `#${h.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Étoiles statiques, haut dans le ciel, indépendantes du circuit chargé. */
export function createStarField(count = 260): Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 260 + Math.random() * 260;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 70 + Math.random() * 180;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const mat = new PointsMaterial({
    color: 0xcfe0ff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
