export const ACCENTS = {
  ink: '#1F4E79',
  pine: '#1F6B4A',
  clay: '#A15C38',
  plum: '#6B3A6A',
  slate: '#3E4C59',
  amber: '#8A5A00',
} as const;

export type AccentName = keyof typeof ACCENTS;

export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];

// Same six hues, lightened so a list name stays readable on the dark sheet.
const ACCENT_ON_DARK: Record<AccentName, string> = {
  ink: '#9BB8D4',
  pine: '#8FCBAA',
  clay: '#E0A07A',
  plum: '#D4A0D2',
  slate: '#C5D0D8',
  amber: '#F0C36A',
};

export function accentColor(name: string, onDark = false): string {
  const key: AccentName = name in ACCENTS ? (name as AccentName) : 'ink';
  return onDark ? ACCENT_ON_DARK[key] : ACCENTS[key];
}

export const PRIORITY_COLOR = {
  3: '#9B2C2C',
  2: '#8A5A00',
  1: '#1F6B4A',
} as const;

// The light-mode inks are too dark to read on the dark sheet, and too dark
// to carry white chip text. These are the same three hues, lightened.
export const PRIORITY_COLOR_DARK = {
  3: '#F0A0A0',
  2: '#F0C36A',
  1: '#8FCBAA',
} as const;

export function priorityColor(priority: number, fallback: string, onDark = false): string {
  if (priority === 3 || priority === 2 || priority === 1) {
    return onDark ? PRIORITY_COLOR_DARK[priority] : PRIORITY_COLOR[priority];
  }
  return fallback;
}

// Light keeps the poster: gray field, white sheet, black ink.
// Dark is the same monochrome print with the values flipped, so Appearance
// actually changes the screen. A shared object made Dark a no-op.
const LIGHT = {
  bg: '#DCDCDC',
  surface: '#FFFFFF',
  text: '#000000',
  muted: '#000000',
  line: '#000000',
  rule: '#000000',
  danger: '#000000',
} as const;

const DARK = {
  bg: '#161616',
  surface: '#242424',
  text: '#F3F3F3',
  muted: '#C6C6C6',
  line: '#F3F3F3',
  rule: '#F3F3F3',
  danger: '#F3F3F3',
} as const;

export const PAPER = {
  light: LIGHT,
  dark: DARK,
} as const;

export type Paper = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  rule: string;
  danger: string;
};

// Priority 0 is "none": the title stays the sheet's normal ink.
// 1 is low, 2 is medium, 3 is high.
export function taskInk(priority: number, paper: Pick<Paper, 'bg' | 'text'>): string {
  return priorityColor(priority, paper.text, paper.bg === PAPER.dark.bg);
}

export function accentInk(name: string, paper: Pick<Paper, 'bg'>): string {
  return accentColor(name, paper.bg === PAPER.dark.bg);
}
