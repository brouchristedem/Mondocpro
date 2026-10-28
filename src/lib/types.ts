export type Block =
  | { t: 'h'; level: 1 | 2 | 3 | 4; text: string }
  | { t: 'p'; text: string }
  | { t: 'li'; text: string }
  | { t: 'table'; rows: string[][]; caption?: string }

export interface Logo { url: string; w: number; h: number }

export interface Cover {
  enabled: boolean
  school: string
  kind: string
  title: string
  author: string
  supervisor: string
  year: string
  logo?: Logo
}

export interface Settings {
  font: string
  size: number
  spacing: number
  justify: boolean
  indent: boolean
  reliure: boolean
  footer: 'number' | 'page' | 'text'
  footerText: string
  numAlign: 'center' | 'right'
  headerText: string
  toc: boolean
  tablesList: boolean
  romanPrelim: boolean
  chapterBreak: boolean
  landscape: boolean
  cover: Cover
}

export const DEFAULTS: Settings = {
  font: 'Times New Roman',
  size: 12,
  spacing: 1.5,
  justify: true,
  indent: true,
  reliure: false,
  footer: 'number',
  footerText: '',
  numAlign: 'center',
  headerText: '',
  toc: true,
  tablesList: false,
  romanPrelim: false,
  chapterBreak: false,
  landscape: true,
  cover: {
    enabled: false,
    school: '',
    kind: '',
    title: '',
    author: '',
    supervisor: '',
    year: '',
  },
}

/** Modèles : un seul geste règle tout (page de garde, sommaire, sauts de page). */
export const PRESETS = {
  complet: { label: 'Complet', hint: 'Page de garde, sommaire, liste des tableaux, chaque titre principal sur une nouvelle page.', cover: true, toc: true, chapterBreak: true, tablesList: true },
  standard: { label: 'Standard', hint: 'Sommaire automatique et pagination, sans page de garde.', cover: false, toc: true, chapterBreak: false, tablesList: false },
  simple: { label: 'Simple', hint: 'Ton texte, bien présenté, avec les numéros de page.', cover: false, toc: false, chapterBreak: false, tablesList: false },
} as const
export type PresetKey = keyof typeof PRESETS
export const DEFAULT_PRESET: PresetKey = 'standard'
/** Anciens noms de modèles (versions précédentes du site). */
export const LEGACY_PRESETS: Record<string, PresetKey> = { memoire: 'complet', rapport: 'standard', libre: 'simple' }
