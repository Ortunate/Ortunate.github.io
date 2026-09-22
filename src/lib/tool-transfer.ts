export const transferKey = 'ortunate:tool-transfer:v1';
export interface ToolTransfer { before: string; after: string; createdAt: number }
export function readTransfer(raw: string | null, now = Date.now()): ToolTransfer | null {
  try {
    const data = JSON.parse(raw || 'null');
    return data && typeof data.before === 'string' && typeof data.after === 'string' && data.before.length <= 100_000 && data.after.length <= 100_000 &&
      Number.isFinite(data.createdAt) && data.createdAt <= now && now - data.createdAt <= 300_000 ? {before: data.before, after: data.after, createdAt: data.createdAt} : null;
  } catch { return null; }
}
