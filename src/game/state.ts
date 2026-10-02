// Source de vérité de la partie : joueurs, scores, billes actives, phase. Pur (pas de Phaser).
export type Phase = 'playing' | 'podium';

export interface Viewer { id: string; name: string; color: string }
export interface Player extends Viewer { score: number; scoredAt: number }

export class GameState {
  readonly players = new Map<string, Player>();
  private readonly active = new Set<string>(); // viewers ayant une bille en jeu
  phase: Phase = 'playing';
  endsAt = 0;
  private podiumEndsAt = 0;

  constructor(private readonly maxBalls: number, private readonly podiumMs: number) {}

  start(now: number, durationMs: number) {
    this.players.clear();
    this.active.clear();
    this.phase = 'playing';
    this.endsAt = now + durationMs;
  }

  canDrop(userId: string): boolean {
    return this.phase === 'playing' && !this.active.has(userId) && this.active.size < this.maxBalls;
  }

  ballStarted(v: Viewer) {
    this.active.add(v.id);
    const p = this.players.get(v.id);
    if (p) Object.assign(p, { name: v.name, color: v.color });
    else this.players.set(v.id, { ...v, score: 0, scoredAt: 0 });
  }

  ballFinished(userId: string) { this.active.delete(userId); }

  addScore(userId: string, points: number, now: number) {
    const p = this.players.get(userId);
    if (!p) return;
    p.score += points;
    p.scoredAt = now;
  }

  top(n: number): Player[] {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || a.scoredAt - b.scoredAt)
      .slice(0, n);
  }

  remainingMs(now: number) { return Math.max(0, this.endsAt - now); }

  endNow(now: number) { this.endsAt = Math.min(this.endsAt, now); }

  /** Fait avancer les phases ; renvoie la transition survenue ('next' = lancer une nouvelle partie). */
  tick(now: number): 'podium' | 'next' | null {
    if (this.phase === 'playing' && now >= this.endsAt) {
      this.phase = 'podium';
      this.podiumEndsAt = now + this.podiumMs;
      return 'podium';
    }
    if (this.phase === 'podium' && now >= this.podiumEndsAt) return 'next';
    return null;
  }
}
