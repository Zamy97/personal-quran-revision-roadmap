export interface ReciterOption {
  id: string;
  label: string;
  /** Build a full-surah MP3 URL for surah 1–114. */
  audioUrl: (surahNumber: number) => string;
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export const RECITERS: ReciterOption[] = [
  {
    id: 'shuraim',
    label: 'Saud Ash-Shuraim',
    // mp3quran.net hosts Shuraim as continuous surah files
    audioUrl: (n) => `https://server7.mp3quran.net/shur/${pad3(n)}.mp3`
  },
  {
    id: 'alafasy',
    label: 'Mishary Alafasy',
    audioUrl: (n) =>
      `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${n}.mp3`
  }
];

export const DEFAULT_RECITER_ID = 'shuraim';

export function getReciter(id: string): ReciterOption {
  return RECITERS.find((r) => r.id === id) || RECITERS[0];
}
