import { describe, it, expect } from 'vitest';
import { GameState } from './state';

const alice = { id: 'a', name: 'Alice', color: '#f00' };
const bob = { id: 'b', name: 'Bob', color: '#0f0' };
const carol = { id: 'c', name: 'Carol', color: '#00f' };
const zed = { id: 'z', name: 'Zed', color: '#fff' };

function started(maxBalls = 10) {
  const s = new GameState(maxBalls, 15_000);
  s.start(0, 60_000);
  return s;
}

/** Partie dont le timer tourne depuis t = 0 : une première bille a été jouée puis est sortie. */
function running(maxBalls = 10) {
  const s = started(maxBalls);
  s.ballStarted(zed, 0);
  s.ballFinished('z');
  s.players.delete('z');
  return s;
}

describe('GameState — billes', () => {
  it('une seule bille active par viewer', () => {
    const s = started();
    expect(s.canDrop('a')).toBe(true);
    s.ballStarted(alice, 0);
    expect(s.canDrop('a')).toBe(false);
    expect(s.canDrop('b')).toBe(true);
  });

  it('peut relancer une fois la bille terminée', () => {
    const s = started();
    s.ballStarted(alice, 0);
    s.ballFinished('a');
    expect(s.canDrop('a')).toBe(true);
  });

  it('plafond global maxBalls', () => {
    const s = started(2);
    s.ballStarted(alice, 0);
    s.ballStarted(bob, 0);
    expect(s.canDrop('c')).toBe(false);
    s.ballFinished('a');
    expect(s.canDrop('c')).toBe(true);
  });

  it('aucun drop pendant le podium', () => {
    const s = running();
    s.tick(60_000);
    expect(s.phase).toBe('podium');
    expect(s.canDrop('a')).toBe(false);
  });
});

describe('GameState — scores', () => {
  it('cumule les points et met à jour le nom', () => {
    const s = started();
    s.ballStarted(alice, 0);
    s.addScore('a', 5, 10);
    s.addScore('a', 7, 20);
    s.ballStarted({ ...alice, name: 'AliceRenamed' }, 0);
    expect(s.players.get('a')).toMatchObject({ name: 'AliceRenamed', score: 12 });
  });

  it('rename() met à jour le nom d\'un joueur connu, ignore les inconnus', () => {
    const s = started();
    s.ballStarted({ ...alice, name: 'Viewer-1234' }, 0);
    s.rename('a', 'Alice');
    s.rename('zzz', 'Nobody');
    expect(s.players.get('a')!.name).toBe('Alice');
    expect(s.players.has('zzz')).toBe(false);
  });

  it('ignore les points d\'un viewer inconnu', () => {
    const s = started();
    s.addScore('zzz', 5, 10);
    expect(s.players.size).toBe(0);
  });

  it('top(n) trié par score, ex æquo départagés par le premier arrivé', () => {
    const s = started();
    for (const p of [alice, bob, carol]) s.ballStarted(p, 0);
    s.addScore('a', 10, 300);
    s.addScore('b', 10, 100);
    s.addScore('c', 50, 200);
    expect(s.top(3).map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(s.top(2)).toHaveLength(2);
  });

  it('les billes qui finissent pendant le podium comptent encore', () => {
    const s = started();
    s.ballStarted(alice, 0);
    s.tick(60_000);
    s.addScore('a', 100, 61_000);
    expect(s.players.get('a')!.score).toBe(100);
  });
});

describe('GameState — cycle', () => {
  it('timer basé sur l\'horodatage de fin', () => {
    const s = running();
    expect(s.remainingMs(15_000)).toBe(45_000);
    expect(s.remainingMs(90_000)).toBe(0);
  });

  it('playing → podium → next', () => {
    const s = running();
    expect(s.tick(59_999)).toBe(null);
    expect(s.tick(60_000)).toBe('podium');
    expect(s.tick(70_000)).toBe(null);
    expect(s.tick(75_000)).toBe('next');
  });

  it('endNow() termine la partie immédiatement', () => {
    const s = running();
    s.endNow(5_000);
    expect(s.tick(5_000)).toBe('podium');
  });

  it('start() remet tout à zéro', () => {
    const s = started();
    s.ballStarted(alice, 0);
    s.addScore('a', 5, 1);
    s.start(100_000, 60_000);
    expect(s.players.size).toBe(0);
    expect(s.canDrop('a')).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.waiting).toBe(true);
  });
});

describe('GameState — pause', () => {
  it('gèle le timer, refuse les drops, bloque les transitions', () => {
    const s = running();
    s.pause(10_000);
    expect(s.paused).toBe(true);
    expect(s.remainingMs(40_000)).toBe(50_000);
    expect(s.canDrop('a')).toBe(false);
    expect(s.tick(70_000)).toBe(null);
    s.resume(40_000);
    expect(s.paused).toBe(false);
    expect(s.remainingMs(40_000)).toBe(50_000);
    expect(s.canDrop('a')).toBe(true);
    expect(s.tick(89_999)).toBe(null);
    expect(s.tick(90_000)).toBe('podium');
  });

  it('pause pendant le podium : fin du podium décalée', () => {
    const s = running();
    expect(s.tick(60_000)).toBe('podium'); // podium jusqu'à 75 000
    s.pause(70_000);
    expect(s.tick(80_000)).toBe(null);
    s.resume(90_000);
    expect(s.tick(94_999)).toBe(null);
    expect(s.tick(95_000)).toBe('next');
  });

  it('pause idempotente, reprise sans pause sans effet', () => {
    const s = running();
    s.resume(5_000);
    expect(s.remainingMs(5_000)).toBe(55_000);
    s.pause(10_000);
    s.pause(20_000);
    s.resume(30_000);
    expect(s.remainingMs(30_000)).toBe(50_000);
  });

  it('la durée jouée exclut la pause', () => {
    const s = running();
    s.pause(10_000);
    s.resume(30_000);
    expect(s.endsAt - s.startedAt).toBe(60_000);
  });

  it('start() lève la pause', () => {
    const s = started();
    s.pause(10_000);
    s.start(20_000, 60_000);
    expect(s.paused).toBe(false);
    expect(s.canDrop('a')).toBe(true);
  });
});

describe('GameState — joueurs et modération', () => {
  it('compte les billes jouées', () => {
    const s = started();
    s.ballStarted(alice, 0);
    s.ballFinished('a');
    s.ballStarted(alice, 0);
    expect(s.players.get('a')!.balls).toBe(2);
  });

  it('hasBall suit la bille active', () => {
    const s = started();
    s.ballStarted(alice, 0);
    expect(s.hasBall('a')).toBe(true);
    s.ballFinished('a');
    expect(s.hasBall('a')).toBe(false);
  });

  it('resetScore() remet à zéro sans retirer le joueur, ignore les inconnus', () => {
    const s = started();
    s.ballStarted(alice, 0);
    s.addScore('a', 50, 10);
    s.resetScore('a');
    s.resetScore('zzz');
    expect(s.players.get('a')!.score).toBe(0);
    expect(s.players.size).toBe(1);
  });

  it('remove() retire le joueur et sa bille active', () => {
    const s = started();
    s.ballStarted(alice, 0);
    s.ballStarted(bob, 0);
    s.remove('a');
    expect(s.players.has('a')).toBe(false);
    expect(s.hasBall('a')).toBe(false);
    expect(s.top(10).map((p) => p.id)).toEqual(['b']);
  });

  it('maxBalls modifiable à chaud', () => {
    const s = started(10);
    s.ballStarted(alice, 0);
    s.maxBalls = 1;
    expect(s.canDrop('b')).toBe(false);
  });
});

describe('GameState — attente de la première bille', () => {
  it('le timer ne part pas sans bille', () => {
    const s = started();
    expect(s.waiting).toBe(true);
    expect(s.remainingMs(500_000)).toBe(60_000);
    expect(s.tick(500_000)).toBe(null);
    expect(s.phase).toBe('playing');
    expect(s.canDrop('a')).toBe(true);
  });

  it('la première bille lance le timer, les suivantes ne le relancent pas', () => {
    const s = started();
    s.ballStarted(alice, 100_000);
    expect(s.waiting).toBe(false);
    s.ballStarted(bob, 130_000);
    expect(s.remainingMs(130_000)).toBe(30_000);
    expect(s.endsAt - s.startedAt).toBe(60_000);
    expect(s.tick(159_999)).toBe(null);
    expect(s.tick(160_000)).toBe('podium');
  });

  it('pause pendant l\'attente : la durée complète reste due', () => {
    const s = started();
    s.pause(10_000);
    expect(s.canDrop('a')).toBe(false);
    s.resume(40_000);
    expect(s.waiting).toBe(true);
    expect(s.remainingMs(40_000)).toBe(60_000);
    s.ballStarted(alice, 50_000);
    expect(s.tick(109_999)).toBe(null);
    expect(s.tick(110_000)).toBe('podium');
  });

  it('endNow() en attente : podium vide tout de suite, durée jouée nulle', () => {
    const s = started();
    s.endNow(5_000);
    expect(s.waiting).toBe(false);
    expect(s.tick(5_000)).toBe('podium');
    expect(s.endsAt - s.startedAt).toBe(0);
    expect(s.tick(20_000)).toBe('next');
  });

  it('chaque nouvelle partie repart en attente', () => {
    const s = running();
    s.start(100_000, 30_000);
    expect(s.waiting).toBe(true);
    expect(s.remainingMs(900_000)).toBe(30_000);
  });
});

describe('GameState — bille bonus', () => {
  it('le viewer ne relance qu\'une fois ses deux billes sorties', () => {
    const s = started();
    s.ballStarted(alice, 0);
    expect(s.extraBall('a')).toBe(true);
    s.ballFinished('a');
    expect(s.hasBall('a')).toBe(true);
    expect(s.canDrop('a')).toBe(false);
    s.ballFinished('a');
    expect(s.canDrop('a')).toBe(true);
    expect(s.players.get('a')!.balls).toBe(1); // la bille bonus n'est pas une bille jouée
  });

  it('compte dans le plafond et est refusée au plafond', () => {
    const s = started(2);
    s.ballStarted(alice, 0);
    expect(s.extraBall('a')).toBe(true);
    expect(s.canDrop('b')).toBe(false);
    expect(s.extraBall('a')).toBe(false);
    s.ballFinished('a');
    expect(s.canDrop('b')).toBe(true);
  });

  it('refusée pour un inconnu ; une fin de bille en trop ne fausse pas le plafond', () => {
    const s = started(1);
    expect(s.extraBall('zzz')).toBe(false);
    s.ballFinished('zzz');
    s.ballStarted(alice, 0);
    expect(s.canDrop('b')).toBe(false);
  });

  it('remove() libère toutes les billes du joueur dans le plafond', () => {
    const s = started(2);
    s.ballStarted(alice, 0);
    s.extraBall('a');
    s.remove('a');
    s.ballStarted(bob, 0);
    expect(s.canDrop('c')).toBe(true);
  });
});
