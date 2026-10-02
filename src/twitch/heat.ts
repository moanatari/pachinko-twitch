// Extension Heat : clics des viewers sur le stream, coordonnées normalisées 0–1 sur toute la vidéo.
import { reconnectingSocket } from './socket';

export interface HeatClick {
  id: string;
  anonymous: boolean; // « U… » : connecté mais identité non partagée avec l'extension
  x: number; // 0–1 sur la largeur du PLATEAU
}

/** boardFraction = part de la largeur vidéo occupée par le plateau (le panneau latéral est ignoré). */
export function parseHeatClick(raw: string, boardFraction: number): HeatClick | null {
  let d: { type?: unknown; id?: unknown; x?: unknown };
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (d.type !== 'click' || typeof d.id !== 'string' || !d.id || d.id.startsWith('A')) return null;
  const x = parseFloat(String(d.x));
  if (!Number.isFinite(x) || x < 0 || x >= boardFraction) return null;
  return { id: d.id, anonymous: d.id.startsWith('U'), x: x / boardFraction };
}

export function connectHeat(roomId: string, boardFraction: number, onClick: (c: HeatClick) => void, log: (m: string) => void): () => void {
  return reconnectingSocket(`wss://heat-api.j38.net/channel/${roomId}`, {
    message: (data) => {
      const click = parseHeatClick(data, boardFraction);
      if (click) onClick(click);
    },
  }, log);
}
