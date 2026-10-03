export interface BrowseState { query: string; category: string; savedOnly: boolean }
export interface Searchable { text: string; category: string; saved: boolean }

export function readBrowseState(params: URLSearchParams, categories: readonly string[]): BrowseState {
  const category = params.get('category') || 'All';
  return {query: params.get('q') || '', category: categories.includes(category) ? category : 'All', savedOnly: params.get('saved') === '1'};
}

export function writeBrowseState(url: URL, state: BrowseState): URL {
  const next = new URL(url);
  for (const [key, value] of [['q', state.query.trim()], ['category', state.category === 'All' ? '' : state.category], ['saved', state.savedOnly ? '1' : '']]) {
    if (value) next.searchParams.set(key, value); else next.searchParams.delete(key);
  }
  return next;
}

export function matchesBrowse(entry: Searchable, state: BrowseState): boolean {
  const text = entry.text.normalize('NFKC').toLowerCase();
  const words = state.query.normalize('NFKC').toLowerCase().trim().split(/\s+/);
  return (state.category === 'All' || entry.category === state.category) && (!state.savedOnly || entry.saved) && words.every(word => text.includes(word));
}

export function parseSaved(raw: string | null): Set<string> {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch { return new Set(); }
}
