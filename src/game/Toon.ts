import { DataTexture, NearestFilter, RedFormat, UnsignedByteType } from 'three';

/**
 * Dégradé à paliers pour MeshToonMaterial : ombre cell-shadée nette plutôt qu'un fondu PBR.
 * C'est le cœur du parti pris « bas-poly assumé » plutôt que « bas-poly par défaut ».
 */
function createGradient(steps: number): DataTexture {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round((255 * (i + 1)) / steps);
  const tex = new DataTexture(data, steps, 1, RedFormat, UnsignedByteType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Voitures : 4 paliers (lecture nette à faible distance). */
export const toonGradient = createGradient(4);
/** Décor : 3 paliers (plus doux sur de grandes surfaces planes). */
export const toonGradientSoft = createGradient(3);
