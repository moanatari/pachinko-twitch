// Source de vérité de la partie : joueurs, scores, billes actives, phase. Pur (pas de Phaser).
export type Phase = 'playing' | 'podium';

export interface Viewer { id: string; name: string; color: string }
export interface Player extends Viewer { score: number; scoredAt: number; balls: number }

export class GameState {
  readonly players = new Map<string, Player>();
  private readonly active = new Map<string, number>(); // viewer → billes en jeu (2 avec une bille bonus)
  private inPlay = 0; // total des billes en jeu, borné par maxBalls
  phase: Phase = 'playing';
  waiting = false; // carte prête, timer pas encore lancé : aucune bille jouée
  private durationMs = 0;
  startedAt = 0; // décalé comme endsAt à chaque reprise : endsAt - startedAt = durée jouée
  endsAt = 0;
  private podiumEndsAt = 0;
  private pausedAt: number | null = null;

  constructor(public maxBalls: number, private readonly podiumMs: number) {}

  get paused() { return this.pausedAt !== null; }

  /** Nouvelle partie, en attente : le timer ne part qu'à la première bille. */
  start(now: number, durationMs: number) {
    this.players.clear();
    this.active.clear();
    this.inPlay = 0;
    this.phase = 'playing';
    this.pausedAt = null;
    this.waiting = true;
    this.durationMs = durationMs;
    this.startedAt = this.endsAt = now;
  }

  canDrop(userId: string): boolean {
    return this.phase === 'playing' && !this.paused && !this.active.has(userId) && this.inPlay < this.maxBalls;
  }

  hasBall(userId: string) { return this.active.has(userId); }

  ballStarted(v: Viewer, now: number) {
    if (this.waiting) {
      this.waiting = false;
      this.startedAt = now;
      this.endsAt = now + this.durationMs;
    }
    this.active.set(v.id, (this.active.get(v.id) ?? 0) + 1);
    this.inPlay++;
    const p = this.players.get(v.id);
    if (p) Object.assign(p, { name: v.name, color: v.color, balls: p.balls + 1 });
    else this.players.set(v.id, { ...v, score: 0, scoredAt: 0, balls: 1 });
  }

  /** Bille bonus (taquet spécial) : en plus de la bille du viewer, mais sous le plafond global. */
  extraBall(userId: string): boolean {
    if (!this.players.has(userId) || this.inPlay >= this.maxBalls) return false;
    this.active.set(userId, (this.active.get(userId) ?? 0) + 1);
    this.inPlay++;
    return true;
  }

  ballFinished(userId: string) {
    const n = this.active.get(userId);
    if (!n) return;
    this.inPlay--;
    if (n > 1) this.active.set(userId, n - 1);
    else this.active.delete(userId);
  }

  /** Nom résolu après coup (lookup réseau d'un viewer venu de Heat). */
  rename(userId: string, name: string) {
    const p = this.players.get(userId);
    if (p) p.name = name;
  }

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

  resetScore(userId: string) {
    const p = this.players.get(userId);
    if (p) p.score = 0;
  }

  /** Exclusion : le joueur disparaît du classement (ses billes ont déjà été retirées par Game). */
  remove(userId: string) {
    this.players.delete(userId);
    this.inPlay -= this.active.get(userId) ?? 0;
    this.active.delete(userId);
  }

  /** Gel complet : timer arrêté, drops refusés, aucune transition. */
  pause(now: number) {
    if (this.pausedAt === null) this.pausedAt = now;
  }

  /** Reprise : fin de partie et fin de podium décalées de la durée de la pause. */
  resume(now: number) {
    if (this.pausedAt === null) return;
    const d = now - this.pausedAt;
    this.startedAt += d;
    this.endsAt += d;
    this.podiumEndsAt += d;
    this.pausedAt = null;
  }

  remainingMs(now: number) {
    return this.waiting ? this.durationMs : Math.max(0, this.endsAt - (this.pausedAt ?? now));
  }

  /** En attente : la partie se termine sans avoir commencé (podium vide, durée jouée nulle). */
  endNow(now: number) {
    if (this.waiting) {
      this.waiting = false;
      this.startedAt = this.endsAt = now;
    } else this.endsAt = Math.min(this.endsAt, now);
  }

  /** Fait avancer les phases ; renvoie la transition survenue ('next' = lancer une nouvelle partie). */
  tick(now: number): 'podium' | 'next' | null {
    if (this.paused || this.waiting) return null;
    if (this.phase === 'playing' && now >= this.endsAt) {
      this.phase = 'podium';
      this.podiumEndsAt = now + this.podiumMs;
      return 'podium';
    }
    if (this.phase === 'podium' && now >= this.podiumEndsAt) return 'next';
    return null;
  }
}
