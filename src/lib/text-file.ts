export interface TextFileLimits { characters: number; lines?: number }
export async function readTextFile(file: Pick<Blob, 'size' | 'arrayBuffer'>, limits: TextFileLimits): Promise<string> {
  if (file.size > limits.characters * 4 + 3) throw new Error('This file is too large for this tool.');
  const bytes = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { throw new Error('Choose a UTF-8 text file. This file uses another encoding or contains binary data.'); }
  if (text.includes('\0')) throw new Error('Choose a text file without binary data.');
  if (text.length > limits.characters) throw new Error(`Use at most ${limits.characters.toLocaleString('en-US')} characters.`);
  if (limits.lines && text.replace(/\r\n?/g, '\n').split('\n').length > limits.lines) throw new Error(`Use at most ${limits.lines.toLocaleString('en-US')} lines.`);
  return text;
}
