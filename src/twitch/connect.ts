import { params, BOARD_W, WIDTH, WALL } from '../config';
import type { Game } from '../scenes/Game';
import { connectChat } from './chat';
import { connectHeat } from './heat';

const log = (m: string) => { if (params.debug) console.log('[twitch]', m); };

/** Tchat (!drop, commandes mods) puis Heat dès que le tchat a donné l'id numérique de la chaîne. */
export function connectTwitch(game: Game, channel: string) {
  connectChat(channel, {
    onRoomId: (roomId) => {
      log(`room-id ${roomId}`);
      connectHeat(roomId, BOARD_W / WIDTH, (c) => {
        // ponytail: nom provisoire, remplacé par le lookup users.ts (étape 7)
        const name = c.anonymous ? `Anonyme-${c.id.slice(-4)}` : `Viewer-${c.id.slice(-4)}`;
        game.requestDrop({ id: c.id, name, color: '#ffffff' }, c.x * BOARD_W);
      }, log);
    },
    onCommand: (cmd, tags, login) => {
      if (cmd.type === 'admin') {
        game.admin(cmd.action);
        return;
      }
      const id = tags['user-id'];
      if (!id) return;
      const viewer = { id, name: tags['display-name'] || login, color: tags.color || '#ffffff' };
      const pct = cmd.pct ?? Math.random() * 100;
      game.requestDrop(viewer, WALL + (pct / 100) * (BOARD_W - 2 * WALL));
    },
  }, log);
}
