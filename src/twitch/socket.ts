/** WebSocket qui se reconnecte avec backoff exponentiel (1 s, 2 s, 4 s… plafonné à 30 s). */
export function reconnectingSocket(
  url: string,
  handlers: { open?: (ws: WebSocket) => void; message: (data: string, ws: WebSocket) => void },
  log: (msg: string) => void = () => {},
) {
  let delay = 1000;
  const connect = () => {
    const ws = new WebSocket(url);
    ws.onopen = () => {
      delay = 1000;
      log(`connecté : ${url}`);
      handlers.open?.(ws);
    };
    ws.onmessage = (e) => handlers.message(String(e.data), ws);
    ws.onclose = () => {
      log(`déconnecté, nouvelle tentative dans ${delay / 1000} s`);
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };
  connect();
}
