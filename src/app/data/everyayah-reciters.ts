/**
 * Verse-by-verse audio hosted by EveryAyah
 * (https://everyayah.com / https://www.everyayah.com).
 *
 * URL pattern: https://everyayah.com/data/{folder}/{SSSAAA}.mp3
 * where SSS = surah (001–114) and AAA = ayah within the surah.
 */
export interface EveryAyahReciter {
  id: string;
  label: string;
  folder: string;
}

export const EVERYAYAH_RECITERS: EveryAyahReciter[] = [
  {
    id: 'shuraim',
    label: 'Saud Ash-Shuraim',
    folder: 'Saood_ash-Shuraym_128kbps'
  },
  { id: 'alafasy', label: 'Mishary Alafasy', folder: 'Alafasy_128kbps' },
  {
    id: 'sudais',
    label: 'Abdurrahmaan As-Sudais',
    folder: 'Abdurrahmaan_As-Sudais_192kbps'
  },
  {
    id: 'hudhaify',
    label: 'Ali Al-Hudhaifi',
    folder: 'Hudhaify_128kbps'
  },
  {
    id: 'muaiqly',
    label: 'Maher Al-Muaiqly',
    folder: 'MaherAlMuaiqly128kbps'
  },
  {
    id: 'basit',
    label: 'Abdul Basit (Murattal)',
    folder: 'Abdul_Basit_Murattal_192kbps'
  },
  {
    id: 'minshawi',
    label: 'Minshawi (Murattal)',
    folder: 'Minshawy_Murattal_128kbps'
  }
];

export const DEFAULT_EVERYAYAH_RECITER_ID = 'shuraim';

function pad3(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(3, '0');
}

export function getEveryAyahReciter(id: string): EveryAyahReciter {
  return (
    EVERYAYAH_RECITERS.find((r) => r.id === id) || EVERYAYAH_RECITERS[0]
  );
}

/** Verse MP3 on EveryAyah for a surah + ayah. */
export function everyAyahUrl(
  surahNumber: number,
  ayahNumber: number,
  reciterId = DEFAULT_EVERYAYAH_RECITER_ID
): string {
  const folder = getEveryAyahReciter(reciterId).folder;
  return `https://everyayah.com/data/${folder}/${pad3(surahNumber)}${pad3(ayahNumber)}.mp3`;
}
