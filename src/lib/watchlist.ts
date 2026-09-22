export const marketOptions = {US: 'United States', HK: 'Hong Kong', SH: 'Shanghai', SZ: 'Shenzhen'} as const;
export type Market = keyof typeof marketOptions;
export interface WatchedSymbol { id: string; market: Market; symbol: string; name: string; note: string }
export const WATCH_LIMIT = 40;
export const watchlistKey = 'ortunate:watchlist:v1';

export function makeSymbol(market: string, raw: string, name = '', note = ''): WatchedSymbol {
  if (!Object.hasOwn(marketOptions, market)) throw new Error('Choose a supported market.');
  let symbol = raw.normalize('NFKC').trim().toUpperCase();
  if (market === 'US') {
    symbol = symbol.replace('.', '-');
    if (!/^[A-Z]{1,6}(?:-[A-Z])?$/.test(symbol)) throw new Error('Use a US stock or ETF ticker, such as AAPL or BRK-B.');
  } else {
    const suffix = market === 'HK' ? '.HK' : market === 'SH' ? '.SS' : '.SZ';
    if (symbol.endsWith(suffix)) symbol = symbol.slice(0, -suffix.length);
    if (market === 'HK') {
      if (!/^\d{1,5}$/.test(symbol) || Number(symbol) === 0) throw new Error('Use a Hong Kong code of 1–5 digits, such as 700.');
      symbol = String(Number(symbol)).padStart(4, '0');
    } else if (!/^\d{6}$/.test(symbol) || Number(symbol) === 0) {
      throw new Error('Use a six-digit mainland code, such as 600519 or 000001.');
    }
  }
  if (name.length > 60 || note.length > 200) throw new Error('Keep names under 60 characters and notes under 200.');
  return {id: `${market}:${symbol}`, market: market as Market, symbol, name: name.trim(), note: note.trim()};
}
export function quoteSymbol(entry: WatchedSymbol): string {
  return entry.symbol + ({US: '', HK: '.HK', SH: '.SS', SZ: '.SZ'}[entry.market]);
}
export function researchUrl(entry: WatchedSymbol, news = false): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(quoteSymbol(entry))}/${news ? 'news/' : ''}`;
}
export function upsertSymbol(entries: WatchedSymbol[], entry: WatchedSymbol): WatchedSymbol[] {
  const index = entries.findIndex(item => item.id === entry.id);
  if (index >= 0) return entries.map((item, i) => i === index ? entry : item);
  if (entries.length >= WATCH_LIMIT) throw new Error(`Your list holds ${WATCH_LIMIT} symbols. Remove one to make room.`);
  return [...entries, entry];
}
export function readWatchlist(raw: string | null): WatchedSymbol[] {
  try {
    const values: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(values)) return [];
    let entries: WatchedSymbol[] = [];
    for (const value of values.slice(0, 1000)) {
      if (!value || typeof value !== 'object' || typeof value.market !== 'string' || typeof value.symbol !== 'string' || typeof value.name !== 'string' || typeof value.note !== 'string') continue;
      try { entries = upsertSymbol(entries, makeSymbol(value.market, value.symbol, value.name, value.note)); } catch { /* Skip corrupt entries independently. */ }
    }
    return entries;
  } catch { return []; }
}
