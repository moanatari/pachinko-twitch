// Tchat Twitch en lecture anonyme (IRC sur WebSocket) : !drop et commandes mods.
import { reconnectingSocket } from './socket';

export interface IrcMessage {
  tags: Record<string, string>;
  prefix: string;
  command: string;
  params: string[];
  trailing: string;
}

// Échappements IRCv3 : \s → espace, \: → ;, \\ → \, \r, \n
const TAG_ESCAPES: Record<string, string> = { s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' };
const unescapeTag = (v: string) => v.replace(/\\(.)/g, (_, c: string) => TAG_ESCAPES[c] ?? c);

export function parseIrc(line: string): IrcMessage {
  let rest = line;
  const tags: Record<string, string> = {};
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    for (const kv of rest.slice(1, sp).split(';')) {
      const eq = kv.indexOf('=');
      if (eq < 0) tags[kv] = '';
      else tags[kv.slice(0, eq)] = unescapeTag(kv.slice(eq + 1));
    }
    rest = rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  let trailing = '';
  const t = rest.indexOf(' :');
  if (t >= 0) {
    trailing = rest.slice(t + 2);
    rest = rest.slice(0, t);
  } else if (rest.startsWith(':')) {
    trailing = rest.slice(1);
    rest = '';
  }
  const [command = '', ...params] = rest.split(' ').filter(Boolean);
  return { tags, prefix, command, params, trailing };
}

export const isMod = (tags: Record<string, string>) =>
  /(^|,)(broadcaster|moderator)\//.test(tags.badges ?? '') || tags.mod === '1';

export type AdminAction = 'pause' | 'resume' | 'end' | 'start' | 'skip';

export type Command =
  | { type: 'drop'; pct: number | null } // pct = position en % de la largeur du plateau, null = aléatoire
  | { type: 'admin'; action: AdminAction };

const ADMIN: Record<string, AdminAction> = {
  pause: 'pause', stop: 'pause', resume: 'resume', end: 'end', start: 'start', skip: 'skip',
};

export function parseCommand(text: string, mod: boolean): Command | null {
  const [cmd, arg] = text.trim().toLowerCase().split(/\s+/);
  if (cmd === '!drop') {
    const n = parseFloat(arg ?? '');
    return { type: 'drop', pct: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null };
  }
  if (cmd === '!pachinko' && mod && arg && Object.hasOwn(ADMIN, arg)) return { type: 'admin', action: ADMIN[arg] };
  return null;
}

export interface ChatHandlers {
  onRoomId: (roomId: string) => void;
  onCommand: (cmd: Command, tags: Record<string, string>, login: string) => void;
}

export function connectChat(channel: string, h: ChatHandlers, log: (m: string) => void): () => void {
  let roomId = '';
  return reconnectingSocket('wss://irc-ws.chat.twitch.tv:443', {
    open: (ws) => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE'); // ignoré par Twitch pour les connexions anonymes
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws.send(`JOIN #${channel}`);
    },
    message: (data, ws) => {
      for (const line of data.split('\r\n')) {
        if (!line) continue;
        const m = parseIrc(line);
        if (m.command === 'PING') ws.send(`PONG :${m.trailing}`);
        else if (m.command === 'ROOMSTATE' && m.tags['room-id'] && m.tags['room-id'] !== roomId) {
          roomId = m.tags['room-id'];
          h.onRoomId(roomId);
        } else if (m.command === 'PRIVMSG') {
          const cmd = parseCommand(m.trailing, isMod(m.tags));
          if (cmd) h.onCommand(cmd, m.tags, m.prefix.split('!')[0]);
        }
      }
    },
  }, log);
}
