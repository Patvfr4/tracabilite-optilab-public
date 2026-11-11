// Préchargé (deno run --preload) avant chaque fonction lancée par
// integration_test.ts : port d'écoute dédié, et aucun appel hors du simulacre
// local (l'API Resend y est redirigée, tout le reste est refusé).
const port = Number(Deno.env.get('FN_PORT'));
const simulacre = Deno.env.get('SIMULACRE_URL') ?? '';

const servirOrigine = Deno.serve.bind(Deno);
// deno-lint-ignore no-explicit-any -- remplacement de Deno.serve pour le test uniquement.
(Deno as any).serve = (gestionnaire: (r: Request) => Response | Promise<Response>) =>
  servirOrigine({ port, hostname: '127.0.0.1', onListen() {} }, gestionnaire);

const fetchOrigine = globalThis.fetch;
globalThis.fetch = ((entree: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
  if (url.startsWith('https://api.resend.com/')) {
    return fetchOrigine(`${simulacre}/resend${new URL(url).pathname}`, init);
  }
  if (!simulacre || !url.startsWith(simulacre)) {
    return Promise.reject(new Error(`appel externe interdit pendant le test : ${url}`));
  }
  return fetchOrigine(entree, init);
}) as typeof fetch;
