// A sessão em que um cliente da nuvem nasceu (revisão de 07/11). Comparar só a conta deixava o
// cliente de A voltar a valer em A → B → A. O session_id do token muda a cada entrada e não muda
// quando o token só é renovado; `vez` sobe a cada entrada e saída feitas pelo app, e separa as
// sessões quando o token não traz session_id.
export function chaveDaSessao(s: {access_token: string; user: {id: string}} | null, vez: number): string | null {
  if (!s) return null;
  let sessionId = '';
  try {
    const parte = s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    sessionId = String(JSON.parse(atob(parte)).session_id ?? '');
  } catch {}
  return `${vez}|${s.user.id}|${sessionId}`;
}
