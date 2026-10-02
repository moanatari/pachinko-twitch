import { describe, it, expect } from 'vitest';
import { esc, safeColor, safeImage } from './html';

describe('html', () => {
  it('esc neutralise le HTML et les attributs', () =>
    expect(esc(`<img src=x onerror="alert('x')">&`))
      .toBe('&#60;img src=x onerror=&#34;alert(&#39;x&#39;)&#34;&#62;&#38;'));

  it.each([
    ['#A1b2C3', '#A1b2C3'],
    ['red;background:url(https://x)', '#888888'],
    ['#fff', '#888888'],
  ])('safeColor(%j) → %j', (c, expected) => expect(safeColor(c)).toBe(expected));

  it.each([
    ['https://static-cdn.jtvnw.net/a.png', 'https://static-cdn.jtvnw.net/a.png'],
    ['javascript:alert(1)', null],
    ['http://x/a.png', null],
    [null, null],
    [undefined, null],
  ])('safeImage(%j) → %j', (u, expected) => expect(safeImage(u)).toBe(expected));
});
