import {marketOptions, quoteSymbol, type WatchedSymbol} from './watchlist.ts';

export type WatchSort = 'saved' | 'symbol' | 'name';
export function filterWatchlist(entries: WatchedSymbol[], market: string, query: string, sort: WatchSort): WatchedSymbol[] {
  const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = entries.filter(entry => {
    if (market !== 'All' && entry.market !== market) return false;
    const text = `${quoteSymbol(entry)} ${entry.symbol.replace('-', '.')} ${entry.name} ${entry.note} ${marketOptions[entry.market]}`.normalize('NFKC').toLowerCase();
    return words.every(word => text.includes(word));
  });
  if (sort !== 'saved') {
    const label = (entry: WatchedSymbol) => sort === 'name' ? entry.name || quoteSymbol(entry) : quoteSymbol(entry);
    visible.sort((a,b) => label(a).localeCompare(label(b), 'en', {numeric:true,sensitivity:'base'}));
  }
  return visible;
}
