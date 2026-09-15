/** Browser SpeechRecognition typings (Chrome / Edge). */
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Strip tashkeel / tatweel and normalize common Arabic letter variants. */
export function normalizeArabic(input: string): string {
  return (input || '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآاٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rough similarity: shared word ratio + substring containment.
 * Returns 0–1.
 */
export function arabicSimilarity(heard: string, expected: string): number {
  const a = normalizeArabic(heard);
  const b = normalizeArabic(expected);
  if (!a || !b) {
    return 0;
  }
  if (a.includes(b) || b.includes(a)) {
    return 1;
  }
  const aw = a.split(' ').filter(Boolean);
  const bw = b.split(' ').filter(Boolean);
  if (!aw.length || !bw.length) {
    return 0;
  }
  const bSet = new Set(bw);
  const hits = aw.filter((w) => bSet.has(w)).length;
  const wordScore = hits / Math.max(bw.length, 1);
  // Also reward long overlapping runs of characters.
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let best = 0;
  for (let len = Math.min(shorter.length, 24); len >= 6; len--) {
    for (let i = 0; i + len <= shorter.length; i++) {
      if (longer.includes(shorter.slice(i, i + len))) {
        best = len / Math.max(b.length, 1);
        len = 0;
        break;
      }
    }
  }
  return Math.max(wordScore, best);
}
