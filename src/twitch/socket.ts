/** WebSocket qui se reconnecte avec backoff exponentiel (1 s, 2 s, 4 s… plafonné à 30 s).
 *  Renvoie une fermeture définitive : plus de reconnexion, messages tardifs ignorés. */
export function reconnectingSocket(
  url: string,
  handlers: { open?: (ws: WebSocket) => void; message: (data: string, ws: WebSocket) => void },
  log: (msg: string) => void = () => {},
): () => void {
  let delay = 1000;
  let closed = false;
  let ws: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      if (closed) return;
      delay = 1000;
      log(`connecté : ${url}`);
      handlers.open?.(sock);
    };
    sock.onmessage = (e) => { if (!closed) handlers.message(String(e.data), sock); };
    sock.onclose = () => {
      if (closed) return;
      log(`déconnecté, nouvelle tentative dans ${delay / 1000} s`);
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };
  connect();
  return () => {
    closed = true;
    clearTimeout(retry);
    ws?.close();
  };
}
