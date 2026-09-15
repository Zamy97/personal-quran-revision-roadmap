import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SURAHS, Surah, getSurah, surahLabel } from '../../data/surahs';
import {
  DEFAULT_EVERYAYAH_RECITER_ID,
  EVERYAYAH_RECITERS,
  everyAyahUrl
} from '../../data/everyayah-reciters';

type MemorizeMode = 'grow' | 'slide' | 'loop';

interface AyahText {
  number: number;
  text: string;
}

@Component({
  selector: 'app-memorize',
  templateUrl: './memorize.component.html',
  styleUrl: './memorize.component.css'
})
export class MemorizeComponent implements OnDestroy {
  readonly surahs = SURAHS;
  readonly surahLabel = surahLabel;
  readonly reciters = EVERYAYAH_RECITERS;
  readonly modes: { id: MemorizeMode; label: string; hint: string }[] = [
    {
      id: 'grow',
      label: 'IntelliJ · Grow',
      hint: 'Build up: 1 → 1–2 → 1–2–3… then keep the window sliding'
    },
    {
      id: 'slide',
      label: 'Moving window',
      hint: 'Fixed-size window that slides forward through the range'
    },
    {
      id: 'loop',
      label: 'Loop range',
      hint: 'Repeat the full from–to range as one set'
    }
  ];
  readonly repeatChoices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
  readonly windowChoices = [1, 2, 3, 4, 5, 6, 7, 8];
  readonly delayChoices = [0, 250, 500, 750, 1000, 1500, 2000, 3000];

  surahNumber = 67;
  fromAyah = 1;
  toAyah = 5;
  windowSize = 3;
  repeats = 3;
  ayahDelayMs = 500;
  setDelayMs = 1000;
  mode: MemorizeMode = 'grow';
  reciterId = DEFAULT_EVERYAYAH_RECITER_ID;

  ayahTexts: AyahText[] = [];
  textLoading = false;
  textError = '';

  isPlaying = false;
  isPaused = false;
  statusMessage = '';
  currentAyah = 0;
  currentSetLabel = '';
  setRepeat = 0;
  setRepeatTotal = 0;

  /** Queue of ayah numbers for the active set. */
  private setQueue: number[] = [];
  /** All sets for the session (each is an ayah list). */
  private sessionSets: number[][] = [];
  private setIndex = 0;
  private ayahIndexInSet = 0;
  private delayTimer?: ReturnType<typeof setTimeout>;
  private sessionToken = 0;

  @ViewChild('player') playerRef?: ElementRef<HTMLAudioElement>;

  constructor(private readonly http: HttpClient) {
    this.loadSurahText(this.surahNumber);
  }

  ngOnDestroy(): void {
    this.stopSession();
  }

  get currentSurah(): Surah {
    return getSurah(this.surahNumber) || SURAHS[0];
  }

  get ayahOptions(): number[] {
    return Array.from(
      { length: this.currentSurah.ayahCount },
      (_, i) => i + 1
    );
  }

  get playButtonLabel(): string {
    if (this.isPlaying && !this.isPaused) {
      return '❚❚ Pause';
    }
    if (this.isPaused) {
      return '▶ Resume';
    }
    return '▶ Start';
  }

  get modeHint(): string {
    return this.modes.find((m) => m.id === this.mode)?.hint ?? '';
  }

  get highlightedAyahs(): Set<number> {
    return new Set(this.setQueue);
  }

  onSurahChange(raw: number | string): void {
    const n = Number(raw);
    this.surahNumber = n;
    const max = getSurah(n)?.ayahCount ?? 1;
    this.fromAyah = 1;
    this.toAyah = Math.min(5, max);
    this.stopSession();
    this.loadSurahText(n);
  }

  onFromChange(raw: number | string): void {
    this.fromAyah = Number(raw);
    if (this.toAyah < this.fromAyah) {
      this.toAyah = this.fromAyah;
    }
  }

  onToChange(raw: number | string): void {
    this.toAyah = Number(raw);
    if (this.fromAyah > this.toAyah) {
      this.fromAyah = this.toAyah;
    }
  }

  togglePlay(): void {
    if (this.isPlaying && !this.isPaused) {
      this.pauseSession();
      return;
    }
    if (this.isPaused) {
      this.resumeSession();
      return;
    }
    this.startSession();
  }

  stopSession(): void {
    this.sessionToken += 1;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = undefined;
    }
    const audio = this.playerRef?.nativeElement;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.currentAyah = 0;
    this.currentSetLabel = '';
    this.setQueue = [];
    this.sessionSets = [];
    this.setIndex = 0;
    this.ayahIndexInSet = 0;
    this.setRepeat = 0;
    this.setRepeatTotal = 0;
  }

  onAudioEnded(): void {
    if (!this.isPlaying || this.isPaused) {
      return;
    }
    this.scheduleNext(this.ayahDelayMs);
  }

  onAudioError(): void {
    if (!this.isPlaying) {
      return;
    }
    this.statusMessage =
      'Could not load that verse audio from EveryAyah — skipping.';
    this.scheduleNext(300);
  }

  trackAyah(_: number, ayah: AyahText): number {
    return ayah.number;
  }

  private pauseSession(): void {
    this.isPaused = true;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = undefined;
    }
    this.playerRef?.nativeElement.pause();
    this.statusMessage = 'Paused.';
  }

  private resumeSession(): void {
    this.isPaused = false;
    const audio = this.playerRef?.nativeElement;
    if (audio?.getAttribute('src') && audio.paused && !audio.ended) {
      audio.play().catch(() => this.playCurrentAyah());
      this.statusMessage = 'Resumed.';
      return;
    }
    this.playCurrentAyah();
  }

  private startSession(): void {
    this.normalizeRange();
    this.sessionSets = this.buildSets();
    if (!this.sessionSets.length) {
      this.statusMessage = 'Nothing to play in that range.';
      return;
    }
    this.sessionToken += 1;
    this.isPlaying = true;
    this.isPaused = false;
    this.setIndex = 0;
    this.ayahIndexInSet = 0;
    this.setRepeat = 1;
    this.setRepeatTotal = this.repeats;
    this.activateSet(0);
    this.playCurrentAyah();
  }

  private normalizeRange(): void {
    const max = this.currentSurah.ayahCount;
    this.fromAyah = Math.max(1, Math.min(max, this.fromAyah || 1));
    this.toAyah = Math.max(
      this.fromAyah,
      Math.min(max, this.toAyah || this.fromAyah)
    );
  }

  /**
   * IntelliJ-style set builder:
   * - grow: 1; 1–2; … up to window; then slide
   * - slide: fixed window across the range
   * - loop: one set = full from–to
   */
  private buildSets(): number[][] {
    const start = this.fromAyah;
    const end = this.toAyah;
    const w = Math.max(1, this.windowSize);
    const sets: number[][] = [];

    if (this.mode === 'loop') {
      sets.push(range(start, end));
      return sets;
    }

    if (this.mode === 'grow') {
      const growEnd = Math.min(end, start + w - 1);
      for (let last = start; last <= growEnd; last++) {
        sets.push(range(start, last));
      }
      for (let first = start + 1; first + w - 1 <= end; first++) {
        sets.push(range(first, first + w - 1));
      }
      return sets;
    }

    // slide
    if (end - start + 1 <= w) {
      sets.push(range(start, end));
      return sets;
    }
    for (let first = start; first + w - 1 <= end; first++) {
      sets.push(range(first, first + w - 1));
    }
    return sets;
  }

  private activateSet(index: number): void {
    this.setIndex = index;
    this.setQueue = this.sessionSets[index] ?? [];
    this.ayahIndexInSet = 0;
    this.currentSetLabel = this.setQueue.length
      ? `Ayahs ${this.setQueue[0]}–${this.setQueue[this.setQueue.length - 1]}`
      : '';
  }

  private playCurrentAyah(): void {
    const ayah = this.setQueue[this.ayahIndexInSet];
    const audio = this.playerRef?.nativeElement;
    if (!ayah || !audio) {
      return;
    }
    this.currentAyah = ayah;
    this.statusMessage = `${this.currentSetLabel} · repeat ${this.setRepeat}/${this.setRepeatTotal} · ayah ${ayah}`;
    audio.src = everyAyahUrl(this.surahNumber, ayah, this.reciterId);
    audio.load();
    audio.play().catch(() => {
      this.statusMessage = 'Playback blocked — click Start again.';
      this.stopSession();
    });
  }

  private scheduleNext(delayMs: number): void {
    const token = this.sessionToken;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
    }
    this.delayTimer = setTimeout(() => {
      if (token !== this.sessionToken || this.isPaused || !this.isPlaying) {
        return;
      }
      this.advanceAfterAyah();
    }, Math.max(0, delayMs));
  }

  private advanceAfterAyah(): void {
    if (this.ayahIndexInSet + 1 < this.setQueue.length) {
      this.ayahIndexInSet += 1;
      this.playCurrentAyah();
      return;
    }

    // Finished one pass of the current set.
    if (this.setRepeat < this.setRepeatTotal) {
      this.setRepeat += 1;
      this.ayahIndexInSet = 0;
      this.delayTimer = setTimeout(() => {
        if (!this.isPlaying || this.isPaused) {
          return;
        }
        this.playCurrentAyah();
      }, this.setDelayMs);
      return;
    }

    // Next set.
    if (this.setIndex + 1 < this.sessionSets.length) {
      this.setRepeat = 1;
      this.activateSet(this.setIndex + 1);
      this.delayTimer = setTimeout(() => {
        if (!this.isPlaying || this.isPaused) {
          return;
        }
        this.playCurrentAyah();
      }, this.setDelayMs);
      return;
    }

    this.statusMessage = 'Session complete.';
    this.isPlaying = false;
    this.isPaused = false;
    this.currentAyah = 0;
  }

  private loadSurahText(surahNumber: number): void {
    this.textLoading = true;
    this.textError = '';
    this.ayahTexts = [];
    this.http
      .get<{
        data?: { ayahs?: { numberInSurah: number; text: string }[] };
      }>(`https://api.alquran.cloud/v1/surah/${surahNumber}`)
      .subscribe({
        next: (res) => {
          this.ayahTexts = (res.data?.ayahs ?? []).map((a) => ({
            number: a.numberInSurah,
            text: a.text
          }));
          this.textLoading = false;
        },
        error: () => {
          this.textLoading = false;
          this.textError =
            'Could not load Arabic text. Audio still works from EveryAyah.';
          const max = getSurah(surahNumber)?.ayahCount ?? 0;
          this.ayahTexts = Array.from({ length: max }, (_, i) => ({
            number: i + 1,
            text: ''
          }));
        }
      });
  }
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) {
    out.push(i);
  }
  return out;
}
