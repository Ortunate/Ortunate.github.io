export const themes = ['green', 'blue', 'purple', 'rose', 'amber'] as const;
export const modes = ['system', 'light', 'dark'] as const;
export type Theme = typeof themes[number];
export type ColorMode = typeof modes[number];
export const themeKey = 'ortunate:theme:v1';
export const modeKey = 'ortunate:color-mode:v1';
export const validTheme = (value: unknown): Theme => themes.includes(value as Theme) ? value as Theme : 'green';
export const validMode = (value: unknown): ColorMode => modes.includes(value as ColorMode) ? value as ColorMode : 'system';
export const resolveMode = (mode: ColorMode, dark: boolean): 'light' | 'dark' => mode === 'system' ? (dark ? 'dark' : 'light') : mode;
