/**
 * Transposition des accords, avec des altérations choisies selon la tonalité
 * d'arrivée (ChordSheetJS écrit « E#7 » ou « B#m » dans certains cas).
 */

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Sans tonalité connue : les noms les plus courants. */
const COMMON = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Tonalités majeures (par demi-ton) écrites en bémols : F, Bb, Eb, Ab, Db, Gb. */
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);

export type Spelling = 'sharps' | 'flats' | 'common';

function semitone(letter: string, accidental: string): number {
  const acc = accidental === '#' || accidental === '♯' ? 1 : accidental === 'b' || accidental === '♭' ? -1 : 0;
  return (BASE[letter.toUpperCase()] + acc + 12) % 12;
}

function noteName(n: number, spelling: Spelling): string {
  const i = ((n % 12) + 12) % 12;
  return (spelling === 'sharps' ? SHARPS : spelling === 'flats' ? FLATS : COMMON)[i];
}

const KEY_RE = /^([A-G])([#b♯♭]?)(m(?!aj))?/;

/** Tonalité transposée (« C » + 1 → « Db ») ; texte inchangé s'il n'est pas reconnu. */
export function transposeKey(key: string, delta: number): string {
  const m = KEY_RE.exec(key.trim());
  if (!m || !delta) return key;
  const root = (semitone(m[1], m[2]) + delta + 120) % 12;
  const minor = !!m[3];
  return `${noteName(root, keySpelling(root, minor))}${key.trim().slice(m[0].length - (minor ? 1 : 0))}`;
}

function keySpelling(root: number, minor: boolean): Spelling {
  // Une tonalité mineure s'écrit comme sa relative majeure.
  const major = minor ? (root + 3) % 12 : root;
  return FLAT_MAJOR.has(major) ? 'flats' : 'sharps';
}

/** Altérations à utiliser une fois la tonalité d'origine transposée. */
export function spellingFor(key: string | undefined, delta: number): Spelling {
  const m = key ? KEY_RE.exec(key.trim()) : null;
  if (!m) return 'common';
  return keySpelling((semitone(m[1], m[2]) + delta + 120) % 12, !!m[3]);
}

/**
 * Accord : fondamentale, suffixe, basse facultative. Admet aussi la basse
 * seule (« /Db », changement de basse) et une barre sans basse (« Bb/ »).
 */
const CHORD_RE = /^(?:([A-G])([#b♯♭]?)([^/]*?))?(?:\/(?:([A-G])([#b♯♭]?))?)?$/;
/** Suffixes d'accord admis (« m7b5 », « maj7 », « sus4 », « add9 ») : « CHORUS » n'est pas un accord C. */
const SUFFIX_RE = /^(?:[Mm]aj|[Mm]in|[Dd]im|[Aa]ug|[Ss]us|[Aa]dd|alt|omit|no|m|M|[0-9]|[#b♯♭+\-°øΔ^*'.,|])*$/;
/** « Sans accord » : un accord, qui ne se transpose pas. */
const NO_CHORD_RE = /^N\.?C\.?$/i;

function parseChord(token: string) {
  const m = CHORD_RE.exec(token);
  // Il faut une fondamentale ou une basse ; « / » seul n'est pas un accord.
  if (!m || (!m[1] && !m[4]) || (m[1] && !SUFFIX_RE.test(m[3]))) return null;
  return { root: m[1], acc: m[2], suffix: m[3] ?? '', slash: token.includes('/'), bass: m[4], bassAcc: m[5] };
}

/** Le mot est-il un accord (« Bb/D », « F#m7 », « Ebmaj7 », « /Db », « N.C. ») ? */
export function isChord(token: string): boolean {
  return NO_CHORD_RE.test(token) || parseChord(token) !== null;
}

/** Un accord (« Bb/D », « F#m7 », « /Db ») ; null s'il n'est pas reconnu. */
function transposeOne(chord: string, delta: number, spelling: Spelling): string | null {
  const c = parseChord(chord);
  if (!c) return null;
  const root = c.root ? `${noteName(semitone(c.root, c.acc) + delta, spelling)}${c.suffix}` : '';
  const bass = c.bass ? noteName(semitone(c.bass, c.bassAcc) + delta, spelling) : '';
  return `${root}${c.slash ? '/' : ''}${bass}`;
}

/**
 * Texte d'accord : un accord, ou plusieurs (« (D) (E) », « C~G »). Ce qui
 * n'est pas un accord (« (REFRAIN) », « N.C. », « x2 ») reste tel quel.
 */
export function transposeChordText(text: string, delta: number, spelling: Spelling): string {
  if (!delta) return text;
  return text.replace(/[^\s()~]+/g, (token) => transposeOne(token, delta, spelling) ?? token);
}
