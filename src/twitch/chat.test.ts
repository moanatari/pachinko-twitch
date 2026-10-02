import { describe, it, expect } from 'vitest';
import { parseIrc, parseCommand, isMod } from './chat';

const PRIVMSG = '@badge-info=;badges=broadcaster/1;color=#FF4500;display-name=MaChaine;emotes=;id=abc;mod=0;room-id=123456;subscriber=0;tmi-sent-ts=1700000000000;turbo=0;user-id=123456;user-type= :machaine!machaine@machaine.tmi.twitch.tv PRIVMSG #machaine :!drop 30';
const ROOMSTATE = '@emote-only=0;followers-only=-1;r9k=0;room-id=123456;slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #machaine';

describe('parseIrc', () => {
  it('PRIVMSG avec tags', () => {
    const m = parseIrc(PRIVMSG);
    expect(m.command).toBe('PRIVMSG');
    expect(m.params).toEqual(['#machaine']);
    expect(m.trailing).toBe('!drop 30');
    expect(m.tags['user-id']).toBe('123456');
    expect(m.tags['display-name']).toBe('MaChaine');
    expect(m.tags.color).toBe('#FF4500');
    expect(m.prefix).toBe('machaine!machaine@machaine.tmi.twitch.tv');
  });

  it('ROOMSTATE donne le room-id', () => {
    const m = parseIrc(ROOMSTATE);
    expect(m.command).toBe('ROOMSTATE');
    expect(m.tags['room-id']).toBe('123456');
  });

  it('PING sans tags ni préfixe', () => {
    const m = parseIrc('PING :tmi.twitch.tv');
    expect(m.command).toBe('PING');
    expect(m.trailing).toBe('tmi.twitch.tv');
    expect(m.tags).toEqual({});
  });

  it('déséchappe les valeurs de tags IRCv3', () =>
    expect(parseIrc('@display-name=a\\sb\\:c\\\\d :x PRIVMSG #c :hi').tags['display-name']).toBe('a b;c\\d'));

  it('message contenant « : » dans le texte', () =>
    expect(parseIrc(':u!u@u PRIVMSG #c :!drop : 50').trailing).toBe('!drop : 50'));
});

describe('parseCommand', () => {
  it.each([
    ['!drop', { type: 'drop', pct: null }],
    ['!drop 30', { type: 'drop', pct: 30 }],
    ['  !DROP   75  ', { type: 'drop', pct: 75 }],
    ['!drop 250', { type: 'drop', pct: 100 }],
    ['!drop -5', { type: 'drop', pct: 0 }],
    ['!drop abc', { type: 'drop', pct: null }],
    ['!drop 12.5', { type: 'drop', pct: 12.5 }],
  ])('%j', (text, expected) => expect(parseCommand(text, true)).toEqual(expected));

  it('ignore les autres messages', () => {
    expect(parseCommand('salut tout le monde', false)).toBeNull();
    expect(parseCommand('!dropzone', false)).toBeNull();
  });

  it('commandes admin réservées aux mods', () => {
    expect(parseCommand('!pachinko skip', true)).toEqual({ type: 'admin', action: 'skip' });
    expect(parseCommand('!pachinko STOP', true)).toEqual({ type: 'admin', action: 'stop' });
    expect(parseCommand('!pachinko start', false)).toBeNull();
    expect(parseCommand('!pachinko dance', true)).toBeNull();
  });
});

describe('isMod', () => {
  it.each([
    [{ badges: 'broadcaster/1' }, true],
    [{ badges: 'moderator/1,subscriber/12' }, true],
    [{ badges: 'subscriber/12', mod: '1' }, true],
    [{ badges: 'subscriber/12', mod: '0' }, false],
    [{}, false],
  ])('%j → %s', (tags, expected) => expect(isMod(tags as Record<string, string>)).toBe(expected));
});
