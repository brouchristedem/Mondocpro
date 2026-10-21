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
  tablesList: true,
  romanPrelim: false,
  chapterBreak: true,
  landscape: true,
  cover: {
    enabled: true,
    school: '',
    kind: 'MÉMOIRE DE FIN D’ÉTUDES',
    title: '',
    author: '',
    supervisor: '',
    year: '',
  },
}

export const PRESETS = {
  memoire: { label: 'Mémoire', kind: 'MÉMOIRE DE FIN D’ÉTUDES', chapterBreak: true, tablesList: true },
  rapport: { label: 'Rapport de stage', kind: 'RAPPORT DE STAGE', chapterBreak: false, tablesList: false },
  libre: { label: 'Document libre', kind: '', chapterBreak: false, tablesList: false },
} as const
export type PresetKey = keyof typeof PRESETS
