/**
 * Textes écrits entre crochets d'accord sans être des accords : en ChordPro,
 * une annotation s'écrit [*texte] (affichée telle quelle, jamais transposée).
 *
 *   [(CHORUS 1 & 2)]   →  [*(CHORUS 1 & 2)]
 *   [Interlude]        →  [*Interlude]
 *   [A (let ring)]     →  [A][*(let ring)]
 *
 * Restent tels quels : les accords, même entre parenthèses ([(Bbm)]), les
 * suites d'accords ([ Gdim7/E | Edim7/C# ]) et les annotations déjà marquées.
 * Les directives, grilles et tablatures ne sont pas touchées.
 */
import { isChord } from './transpose';

/** Mots porteurs de lettres : « 1 », « & », « | » ou « ... » ne décident de rien. */
const words = (text: string) => (text.match(/[^\s()~]+/g) ?? []).filter((w) => /\p{L}/u.test(w));

function annotateBracket(content: string): string {
  if (content.startsWith('*')) return `[${content}]`;
  const all = words(content);
  if (all.length === 0) return `[${content}]`;
  if (!all.some(isChord)) return `[*${content.trim()}]`;
  // Accord(s) suivi(s) d'une précision entre parenthèses : « A (let ring) ».
  const m = /^(.*?\S)\s+(\([^()]*\))\s*$/.exec(content);
  if (m && words(m[1]).every(isChord) && words(m[2]).length > 0 && !words(m[2]).some(isChord)) {
    return `[${m[1].trim()}][*${m[2]}]`;
  }
  return `[${content}]`;
}

const SKIP_START = /^\{\s*(start_of_(tab|grid)|so[tg])\b/i;
const SKIP_END = /^\{\s*(end_of_(tab|grid)|eo[tg])\b/i;

/** Marque les annotations d'un texte ChordPro ; renvoie le texte et le nombre de crochets modifiés. */
export function markAnnotations(chordpro: string): { text: string; changed: number } {
  let changed = 0;
  let skipping = false;
  const lines = chordpro.split('\n').map((line) => {
    const t = line.trim();
    if (SKIP_START.test(t)) skipping = true;
    else if (SKIP_END.test(t)) skipping = false;
    if (skipping || t.startsWith('{')) return line;
    return line.replace(/(?<!\\)\[([^\]]*)\]/g, (all, content: string) => {
      const out = annotateBracket(content);
      if (out !== all) changed++;
      return out;
    });
  });
  return { text: lines.join('\n'), changed };
}
