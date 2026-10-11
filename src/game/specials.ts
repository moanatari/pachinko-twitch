// Taquets spéciaux : catalogue des effets et tirage. Pur (pas de Phaser) ; les effets sont dans scenes/specials.ts.
export const EFFECTS = [
  { id: 'double', label: 'BILLE BONUS', color: '#35e0ff' },
  { id: 'moon', label: 'GRAVITÉ LUNAIRE', color: '#b39dff' },
  { id: 'warp', label: 'TÉLÉPORTATION', color: '#ff5fd0' },
  { id: 'slow', label: 'RALENTI', color: '#5b9dff' },
  { id: 'x2', label: 'POINTS ×2', color: '#6dff7a' },
  { id: 'gold', label: 'PLUIE D\'OR', color: '#ffd23f' },
  { id: 'quake', label: 'SÉISME', color: '#ff7033' },
] as const;

export type EffectId = (typeof EFFECTS)[number]['id'];

/** Réglage `specialEffects` par défaut : tous les effets, dans l'ordre du catalogue. */
export const ALL_EFFECTS: string = EFFECTS.map((e) => e.id).join(',');

/** Liste d'ids séparés par des virgules → ids connus, sans doublon, dans l'ordre du catalogue. */
export function normalizeEffects(raw: string): string {
  const wanted = new Set(raw.split(',').map((s) => s.trim()));
  return EFFECTS.filter((e) => wanted.has(e.id)).map((e) => e.id).join(',');
}

/** Effet du prochain taquet spécial, ou null si aucun n'est tirable. La bille bonus est écartée au plafond de billes. */
export function pickEffect(enabled: string, canDouble: boolean, rnd: () => number): EffectId | null {
  const on = enabled.split(',');
  const ids = EFFECTS.map((e) => e.id).filter((id) => on.includes(id) && (canDouble || id !== 'double'));
  return ids.length ? ids[Math.min(ids.length - 1, Math.floor(rnd() * ids.length))] : null;
}
