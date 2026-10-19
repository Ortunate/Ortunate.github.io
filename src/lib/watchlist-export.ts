import {jsonToCsv} from './csv.ts';
import type {WatchedSymbol} from './watchlist.ts';

export function watchlistCsv(entries: WatchedSymbol[]): string {
  if (!entries.length) throw new Error('No matching symbols to export.');
  return jsonToCsv(JSON.stringify(entries.map(({market,symbol,name,note}) => ({market,symbol,name,note}))));
}
