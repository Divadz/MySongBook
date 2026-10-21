/**
 * Conversion d'un texte « accords au-dessus des paroles » (copié d'un site,
 * d'un mail, d'un PDF) en ChordPro.
 *
 *         Am           F
 *   Le matin se lève sur la ville
 *
 * devient « Le matin se [Am]lève sur la [F]ville » : chaque accord est placé à
 * la colonne où il se trouvait au-dessus des paroles.
 */

export interface ConvertOptions {
  title?: string;
  artist?: string;
  key?: string;
}

export interface ConvertResult {
  chordpro: string;
  /** Valeurs devinées dans le texte, pour préremplir le formulaire. */
  guessed: { title?: string; artist?: string; key?: string; capo?: string; tempo?: string };
  /** Nombre de lignes d'accords fusionnées avec des paroles. */
  mergedLines: number;
}

// Accord : fondamentale, altération, qualité, extensions, basse.
const CHORD_RE =
  /^[A-H](?:#|b|♯|♭)?(?:maj|min|mi|m|M|dim|aug|sus|add|°|ø|\+|-)?(?:\d{1,2})?(?:(?:maj|add|sus|no|b|#|♭|♯|\+|-|M)?\d{1,2})*(?:\([^)]*\))?(?:\/[A-H](?:#|b|♯|♭)?)?$/;
// Éléments tolérés sur une ligne d'accords sans être des accords.
const DECOR_RE = /^(?:\||\|\||:\|\|?|\|\|?:|\/|-+|\.+|%|x\d+|\(?x?\d+x?\)?|\(.*\)|N\.?C\.?|\*)$/i;

const SECTION_RE =
  /^\s*[[(]?\s*(intro|introduction|verse|couplet|chorus|refrain|pre-?chorus|pr[ée]-?refrain|bridge|pont|outro|solo|interlude|coda|instrumental|break|fin|ending|final)\b([^\])]*)[\])]?\s*:?\s*$/i;
const HEADER_COLON_RE = /^\s*([^\s[{][^:]{0,30}):\s*$/;
const TAB_RE = /^\s*[a-gA-G][#b]?\s?[|:][-0-9|hpbrx/\\~^().\s]{4,}$/;
const META_RE = /^\s*(capo|key|tonalit[ée]|tempo|bpm|tuning|accordage)\s*[:=-]?\s*(.+?)\s*$/i;

export function isChord(token: string): boolean {
  return CHORD_RE.test(token);
}

/** Une ligne d'accords ne contient que des accords et des signes de mesure, avec au moins un accord. */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let chords = 0;
  for (const t of tokens) {
    if (isChord(t)) chords++;
    else if (!DECOR_RE.test(t)) return false;
  }
  return chords > 0;
}

interface Token {
  col: number;
  text: string;
}

function tokensWithColumns(line: string): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push({ col: m.index, text: m[0] });
  return out;
}

/** Un accord devient [C] ; une indication devient une annotation [*(x2)]. */
function bracket(t: string): string {
  return isChord(t) ? `[${t}]` : `[*${t}]`;
}

/** Place les accords dans les paroles, à leur colonne. */
export function mergeChordsIntoLyrics(chordLine: string, lyricLine: string): string {
  const tokens = tokensWithColumns(chordLine.replace(/\t/g, '    ')).filter((t) => !/^\|+$/.test(t.text));
  let lyrics = lyricLine.replace(/\t/g, '    ');
  const lastCol = tokens.length ? tokens[tokens.length - 1].col : 0;
  if (lyrics.length < lastCol) lyrics = lyrics.padEnd(lastCol, ' ');
  // De droite à gauche pour ne pas décaler les colonnes restantes.
  const original = lyrics;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const { text } = tokens[i];
    let col = tokens[i].col;
    const limit = i + 1 < tokens.length ? tokens[i + 1].col : original.length;
    if (original[col] === ' ' && /\S/.test(original.slice(col, limit))) {
      while (col < limit && original[col] === ' ') col++;
    }
    lyrics = lyrics.slice(0, col) + bracket(text) + lyrics.slice(col);
  }
  return lyrics.replace(/\s+$/, '');
}

/** Ligne d'accords seule (intro, solo) : [C]   [G]   [Am]. */
export function chordOnlyLine(line: string): string {
  return tokensWithColumns(line)
    .map((t) => (/^\|+$/.test(t.text) ? t.text : bracket(t.text)))
    .join(' ');
}

function sectionType(name: string): 'verse' | 'chorus' | 'bridge' {
  const n = name.toLowerCase();
  if (/chorus|refrain/.test(n) && !/pre|pré/.test(n)) return 'chorus';
  if (/bridge|pont/.test(n)) return 'bridge';
  return 'verse';
}

function cleanLabel(raw: string): string {
  return raw
    .trim()
    .replace(/^[[(]\s*/, '')
    .replace(/\s*[\])]?\s*:?\s*$/, '')
    .replace(/[{}]/g, '')
    .trim();
}

export function convertChordsOverLyrics(text: string, opts: ConvertOptions = {}): ConvertResult {
  const lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n');
  const guessed: ConvertResult['guessed'] = {};
  const body: string[] = [];
  let open: 'verse' | 'chorus' | 'bridge' | 'tab' | null = null;
  /** Position de la directive d'ouverture et libellé de la section ouverte. */
  let openAt = -1;
  let openLabel = '';
  let mergedLines = 0;
  let firstChord: string | undefined;

  const hasContent = () => body.slice(openAt + 1).some((l) => l.trim() !== '');
  const start = (type: 'verse' | 'chorus' | 'bridge' | 'tab', label: string) => {
    if (body.length && body[body.length - 1] !== '') body.push('');
    body.push(label ? `{start_of_${type}: ${label}}` : `{start_of_${type}}`);
    open = type;
    openAt = body.length - 1;
    openLabel = label;
  };
  const close = () => {
    if (open) {
      if (!hasContent()) body.splice(openAt); // section annoncée mais vide
      else body.push(`{end_of_${open}}`);
    }
    open = null;
    openAt = -1;
  };

  // Titre et artiste : premières lignes courtes avant tout accord ou section.
  let i = 0;
  const head: string[] = [];
  while (i < lines.length && head.length < 3) {
    const l = lines[i].trim();
    if (!l) {
      i++;
      if (head.length) break;
      continue;
    }
    if (isChordLine(l) || SECTION_RE.test(l) || META_RE.test(l) || TAB_RE.test(l) || l.length > 60) break;
    head.push(l);
    i++;
  }
  // Une seule ligne d'en-tête suivie de paroles serait en fait un vers : on ne la garde que si elle est suivie d'un vide ou d'une structure.
  if (head.length) {
    const byLine = /^(.*?)\s+(?:-|–|—|by|par)\s+(.*)$/i.exec(head[0]);
    if (byLine) {
      guessed.title = byLine[1].trim();
      guessed.artist = byLine[2].trim();
    } else {
      guessed.title = head[0];
      if (head[1]) guessed.artist = head[1].replace(/^(by|par)\s+/i, '');
    }
  } else {
    i = 0;
  }

  for (; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, '');
    const trimmed = raw.trim();
    const next = lines[i + 1]?.replace(/\s+$/, '') ?? '';

    if (!trimmed) {
      if (open === 'tab') close();
      body.push('');
      continue;
    }

    const meta = META_RE.exec(trimmed);
    if (meta && !isChordLine(trimmed)) {
      const [, name, value] = meta;
      const n = name.toLowerCase();
      if (n === 'capo') guessed.capo = value;
      else if (n === 'tempo' || n === 'bpm') guessed.tempo = value.replace(/\s*bpm$/i, '');
      else if (n.startsWith('key') || n.startsWith('tonalit')) guessed.key = value;
      else body.push(`{comment: ${trimmed.replace(/[{}]/g, '')}}`);
      continue;
    }

    if (TAB_RE.test(raw)) {
      if (open !== 'tab') {
        // « [Solo] » suivi directement d'une tablature : le libellé passe à la tablature.
        const label = open && !hasContent() ? openLabel : '';
        close();
        start('tab', label);
      }
      body.push(raw);
      continue;
    }

    const section = SECTION_RE.exec(trimmed);
    const colon = !section && !isChordLine(trimmed) ? HEADER_COLON_RE.exec(trimmed) : null;
    if (section || colon) {
      close();
      const label = cleanLabel(trimmed);
      start(sectionType(section ? section[1] : label), label);
      continue;
    }

    if (isChordLine(trimmed)) {
      firstChord ??= tokensWithColumns(trimmed).find((t) => isChord(t.text))?.text;
      const nextTrim = next.trim();
      const nextIsLyrics =
        nextTrim !== '' && !isChordLine(nextTrim) && !SECTION_RE.test(nextTrim) && !TAB_RE.test(next) && !META_RE.test(nextTrim);
      if (nextIsLyrics) {
        body.push(mergeChordsIntoLyrics(raw, next));
        mergedLines++;
        i++;
      } else {
        body.push(chordOnlyLine(raw));
      }
      continue;
    }

    body.push(trimmed.replace(/[{}]/g, ''));
  }
  close();

  if (!guessed.key && firstChord) guessed.key = firstChord.replace(/\/.*$/, '');

  const title = opts.title ?? guessed.title ?? 'Sans titre';
  const artist = opts.artist ?? guessed.artist;
  const key = opts.key ?? guessed.key;
  const headLines = [`{title: ${title}}`];
  if (artist) headLines.push(`{artist: ${artist}}`);
  if (key) headLines.push(`{key: ${key}}`);
  if (guessed.tempo) headLines.push(`{tempo: ${guessed.tempo}}`);
  if (guessed.capo) headLines.push(`{capo: ${guessed.capo}}`);

  // Pas plus d'une ligne vide d'affilée, ni en début ou fin de corps.
  const compact: string[] = [];
  for (const l of body) {
    if (l === '' && (compact.length === 0 || compact[compact.length - 1] === '')) continue;
    compact.push(l);
  }
  while (compact.length && compact[compact.length - 1] === '') compact.pop();
  // Les lignes vides juste avant une fin de section sont superflues.
  const tidy = compact.filter((l, k) => !(l === '' && /^\{end_of_/.test(compact[k + 1] ?? '')));

  return { chordpro: `${headLines.join('\n')}\n\n${tidy.join('\n')}\n`, guessed, mergedLines };
}
