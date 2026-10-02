import { describe, it, expect, vi, afterEach } from 'vitest';
import { reconnectingSocket } from './socket';

class FakeWs {
  static all: FakeWs[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeWs.all.push(this); }
  send() {}
  close() { this.closed = true; this.onclose?.(); }
}

describe('reconnectingSocket', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeWs.all = [];
  });

  it('se reconnecte après une coupure', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWs);
    reconnectingSocket('wss://x', { message: () => {} });
    FakeWs.all[0].onclose!();
    vi.advanceTimersByTime(1000);
    expect(FakeWs.all).toHaveLength(2);
  });

  it('close() est définitif : plus de reconnexion ni de messages', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWs);
    const message = vi.fn();
    const close = reconnectingSocket('wss://x', { message });
    close();
    expect(FakeWs.all[0].closed).toBe(true);
    FakeWs.all[0].onmessage!({ data: 'tardif' });
    vi.advanceTimersByTime(60_000);
    expect(FakeWs.all).toHaveLength(1);
    expect(message).not.toHaveBeenCalled();
  });

  it('close() pendant l\'attente de reconnexion annule la tentative', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWs);
    const close = reconnectingSocket('wss://x', { message: () => {} });
    FakeWs.all[0].onclose!(); // coupure : nouvelle tentative programmée dans 1 s
    close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWs.all).toHaveLength(1);
  });
});
