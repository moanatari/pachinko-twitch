// Données tierces (noms Twitch/Heat, couleurs de tchat, URLs d'avatar) injectées dans le DOM du menu. Pur.
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');
export const safeImage = (url: string | null | undefined) => (url && url.startsWith('https://') ? url : null);
