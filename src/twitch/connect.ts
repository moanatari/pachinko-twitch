import { params, BOARD_W, WIDTH, WALL } from '../config';
import type { Game } from '../scenes/Game';
import { connectChat } from './chat';
import { connectHeat } from './heat';
import { users, colorFor } from './users';

const log = (m: string) => { if (params.debug) console.log('[twitch]', m); };

/** Tchat (!drop, commandes mods) puis Heat dès que le tchat a donné l'id numérique de la chaîne.
 *  Renvoie la déconnexion (changement de chaîne dans le menu). */
export function connectTwitch(game: Game, channel: string): () => void {
  let closeHeat = () => {};
  const closeChat = connectChat(channel, {
    onRoomId: (roomId) => {
      log(`room-id ${roomId}`);
      game.setStreamer(roomId, channel); // le streamer joue sous l'id de sa chaîne
      closeHeat();
      closeHeat = connectHeat(roomId, BOARD_W / WIDTH, (c) => {
        // nom en cache si déjà vu, sinon provisoire (Game le remplace dès que le lookup répond)
        const name = users.get(c.id)?.name ?? `${c.anonymous ? 'Anonyme' : 'Viewer'}-${c.id.slice(-4)}`;
        game.requestDrop({ id: c.id, name, color: colorFor(c.id) }, c.x * BOARD_W);
      }, log);
    },
    onCommand: (cmd, tags, login) => {
      if (cmd.type === 'admin') {
        game.admin(cmd.action);
        return;
      }
      const id = tags['user-id'];
      if (!id) return;
      const viewer = { id, name: tags['display-name'] || login, color: tags.color || colorFor(id) };
      const pct = cmd.pct ?? Math.random() * 100;
      game.requestDrop(viewer, WALL + (pct / 100) * (BOARD_W - 2 * WALL));
    },
  }, log);
  return () => {
    closeChat();
    closeHeat();
  };
}
