/**
 * Polices de l'aperçu : des versions « métriquement identiques » à celles de Word
 * (Tinos = Times New Roman, Arimo = Arial, Carlito = Calibri, Gelasio = Georgia).
 * Les retours à la ligne tombent donc au même endroit que dans Word, sur n'importe quel téléphone.
 */
import '@fontsource/tinos/latin-400.css'
import '@fontsource/tinos/latin-700.css'
import '@fontsource/tinos/latin-400-italic.css'
import '@fontsource/tinos/latin-700-italic.css'
import '@fontsource/arimo/latin-400.css'
import '@fontsource/arimo/latin-700.css'
import '@fontsource/arimo/latin-400-italic.css'
import '@fontsource/arimo/latin-700-italic.css'
import '@fontsource/carlito/latin-400.css'
import '@fontsource/carlito/latin-700.css'
import '@fontsource/carlito/latin-400-italic.css'
import '@fontsource/carlito/latin-700-italic.css'
import '@fontsource/gelasio/latin-400.css'
import '@fontsource/gelasio/latin-700.css'
import '@fontsource/gelasio/latin-400-italic.css'
import '@fontsource/gelasio/latin-700-italic.css'

interface FontInfo { family: string; css: string; lh: number }

/** lh = hauteur d'une ligne « simple » de Word, en multiple de la taille de police. */
const FONTS: Record<string, FontInfo> = {
  'Times New Roman': { family: 'Tinos', css: "Tinos, 'Liberation Serif', 'Times New Roman', serif", lh: 1.15 },
  Arial: { family: 'Arimo', css: "Arimo, 'Liberation Sans', Arial, sans-serif", lh: 1.15 },
  Calibri: { family: 'Carlito', css: "Carlito, Calibri, 'Segoe UI', sans-serif", lh: 1.22 },
  Georgia: { family: 'Gelasio', css: "Gelasio, Georgia, serif", lh: 1.136 },
}
export const fontInfo = (name: string): FontInfo => FONTS[name] ?? FONTS['Times New Roman']

/** Attend que les 4 variantes de la police soient prêtes avant toute mesure. */
export async function loadFont(name: string): Promise<void> {
  const f = fontInfo(name).family
  if (!document.fonts) return
  await Promise.all(['', 'italic '].flatMap(st => ['400', '700'].map(w => document.fonts.load(`${st}${w} 12pt ${f}`, 'Aàéèêç’“”…0'))))
  await document.fonts.ready
}
