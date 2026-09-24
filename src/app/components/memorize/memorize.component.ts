import {
  Component,
  ElementRef,
  EventEmitter,
  NgZone,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  arabicSimilarity,
  getSpeechRecognitionConstructor
} from '../../data/arabic-speech';
import { pageWithinSurahForAyah } from '../../data/mushaf-pages';
import { SURAHS, Surah, getSurah, surahLabel } from '../../data/surahs';
import {
  DEFAULT_EVERYAYAH_RECITER_ID,
  EVERYAYAH_RECITERS,
  everyAyahUrl
} from '../../data/everyayah-reciters';

interface AyahText {
  number: number;
  text: string;
}

/** One playable block: a list of ayahs repeated N times. */
interface SessionBlock {
  ayahs: number[];
  repeats: number;
  kind: 'new' | 'set';
  label: string;
}

export interface MemorizeMushafRequest {
  surahNumber: number;
  page: number;
}

/** Browser SpeechRecognition instance (Chrome / Edge). */
interface SpeechRecognitionHandle {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

@Component({
  selector: 'app-memorize',
  templateUrl: './memorize.component.html',
  styleUrl: './memorize.component.css'
})
export class MemorizeComponent implements OnDestroy {
  @Output() openMushaf = new EventEmitter<MemorizeMushafRequest>();
  /** True while a memorize session is actively using audio (incl. paused / sequential wait). */
  @Output() sessionAudioChange = new EventEmitter<boolean>();

  readonly surahs = SURAHS;
  readonly surahLabel = surahLabel;
  readonly reciters = EVERYAYAH_RECITERS;
  readonly repeatChoices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 50];
  readonly windowChoices = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly delayChoices = [0, 250, 500, 750, 1000, 1500, 2000, 3000];
  readonly pauseChoices = [2000, 3000, 4000, 5000, 6000, 8000, 10000, 15000];
  readonly playbackRateChoices = [0.75, 1, 1.25, 1.5, 1.75, 2];
  /** Minimum similarity (0–1) to count an ayah as recited. */
  readonly matchThreshold = 0.55;

  surahNumber = 67;
  fromAyah = 1;
  toAyah = 5;

  /** Intelligent / IntelliJ mode (builds successive sets automatically). */
  intelliJMode = true;
  /** Times each newly introduced ayah plays alone. */
  newAyahRepeats = 3;
  /** Times the growing set (1–2, 1–2–3, …) plays after each new ayah. */
  setRepeats = 2;
  /** Max ayahs in one grow window before sliding (moving window). */
  windowSize = 5;
  movingWindow = false;
  /** After a set finishes, pause so you can revise it in your head. */
  sequentialPause = false;
  sequentialPauseMs = 4000;

  /** Used only when IntelliJ is off: loop the full from–to range. */
  loopRepeats = 3;

  ayahDelayMs = 400;
  playbackRate = 1;
  reciterId = DEFAULT_EVERYAYAH_RECITER_ID;

  ayahTexts: AyahText[] = [];
  textLoading = false;
  textError = '';

  isPlaying = false;
  isPaused = false;
  awaitingContinue = false;
  statusMessage = '';
  currentAyah = 0;
  currentSetLabel = '';
  setRepeat = 0;
  setRepeatTotal = 0;
  blockKind: 'new' | 'set' | '' = '';

  /** Keep parent mushaf viewer on the ayah currently playing. */
  followMushaf = false;
  /** Hide Arabic text while reciting (Tarteel-style practice). */
  hideTextWhileReciting = false;

  speechSupported = !!getSpeechRecognitionConstructor();
  isListening = false;
  reciteAyah = 0;
  lastHeard = '';
  matchScore = 0;
  reciteStatus = '';

  private setQueue: number[] = [];
  private sessionBlocks: SessionBlock[] = [];
  private blockIndex = 0;
  private ayahIndexInSet = 0;
  private delayTimer?: ReturnType<typeof setTimeout>;
  private sessionToken = 0;
  /** What Resume/Continue should do after a sequential pause. */
  private afterPause: 'replay' | 'next-block' = 'next-block';
  private recognition: SpeechRecognitionHandle | null = null;
  private wantListening = false;

  @ViewChild('player') playerRef?: ElementRef<HTMLAudioElement>;

  constructor(
    private readonly http: HttpClient,
    private readonly zone: NgZone
  ) {
    this.loadSurahText(this.surahNumber);
  }

  ngOnDestroy(): void {
    this.stopListening(true);
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
    if (this.awaitingContinue) {
      return '▶ Continue';
    }
    if (this.isPlaying && !this.isPaused) {
      return '❚❚ Pause';
    }
    if (this.isPaused) {
      return '▶ Resume';
    }
    return '▶ Start';
  }

  get intelliJHint(): string {
    if (!this.intelliJMode) {
      return 'Simple loop: plays the full from–to range with the loop repeat count.';
    }
    return (
      'New ayah alone × new-ayah repeats, then the growing set × set times. ' +
      (this.movingWindow
        ? 'Moving window slides the start forward after each full window.'
        : 'Grows from your start ayah through the end of the range.')
    );
  }

  get highlightedAyahs(): Set<number> {
    return new Set(this.setQueue);
  }

  get settingsLocked(): boolean {
    return this.isPlaying || this.isPaused || this.awaitingContinue;
  }

  get reciteTargetText(): string {
    if (!this.reciteAyah) {
      return '';
    }
    return this.ayahTexts.find((a) => a.number === this.reciteAyah)?.text ?? '';
  }

  get showAyahText(): boolean {
    return !(this.isListening && this.hideTextWhileReciting);
  }

  get micButtonLabel(): string {
    return this.isListening ? 'Stop mic' : 'Recite along';
  }

  onSurahChange(raw: number | string): void {
    if (this.settingsLocked) {
      return;
    }
    const n = Number(raw);
    this.surahNumber = n;
    const max = getSurah(n)?.ayahCount ?? 1;
    this.fromAyah = 1;
    this.toAyah = Math.min(5, max);
    this.stopListening(true);
    this.loadSurahText(n);
  }

  /** Open the parent mushaf viewer on the current / range start ayah. */
  openMushafForCurrent(): void {
    const ayah =
      this.currentAyah ||
      this.reciteAyah ||
      this.fromAyah ||
      1;
    this.emitMushaf(ayah);
  }

  toggleListening(): void {
    if (this.isListening) {
      this.stopListening(false);
      return;
    }
    this.startListening();
  }

  onFromChange(raw: number | string): void {
    if (this.settingsLocked) {
      return;
    }
    this.fromAyah = Number(raw);
    if (this.toAyah < this.fromAyah) {
      this.toAyah = this.fromAyah;
    }
  }

  onToChange(raw: number | string): void {
    if (this.settingsLocked) {
      return;
    }
    this.toAyah = Number(raw);
    if (this.fromAyah > this.toAyah) {
      this.fromAyah = this.toAyah;
    }
  }

  onPlaybackRateChange(raw: number | string): void {
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0) {
      return;
    }
    this.playbackRate = rate;
    const audio = this.playerRef?.nativeElement;
    if (audio) {
      audio.playbackRate = rate;
    }
  }

  togglePlay(): void {
    if (this.awaitingContinue) {
      this.continueAfterPause();
      return;
    }
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

  /** Pause the session when another player (revision Listen) takes over audio. */
  pauseForExternalAudio(): void {
    if (this.isPlaying && !this.isPaused) {
      this.pauseSession();
    }
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
    const wasActive =
      this.isPlaying || this.isPaused || this.awaitingContinue;
    this.isPlaying = false;
    this.isPaused = false;
    this.awaitingContinue = false;
    this.currentAyah = 0;
    this.currentSetLabel = '';
    this.setQueue = [];
    this.sessionBlocks = [];
    this.blockIndex = 0;
    this.ayahIndexInSet = 0;
    this.setRepeat = 0;
    this.setRepeatTotal = 0;
    this.blockKind = '';
    if (wasActive) {
      this.sessionAudioChange.emit(false);
    }
  }

  skipReciteAyah(): void {
    if (!this.reciteAyah) {
      return;
    }
    this.advanceReciteTarget();
  }

  private startListening(): void {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      this.reciteStatus =
        'Mic recite needs Chrome or Edge (Web Speech API).';
      return;
    }
    if (this.isPlaying && !this.isPaused) {
      this.pauseSession();
    }
    this.normalizeRange();
    this.wantListening = true;
    this.reciteAyah = this.reciteAyah
      ? Math.max(this.fromAyah, Math.min(this.toAyah, this.reciteAyah))
      : this.fromAyah;
    this.lastHeard = '';
    this.matchScore = 0;
    this.reciteStatus = `Listening for ayah ${this.reciteAyah}…`;
    this.emitMushaf(this.reciteAyah);

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }

    const recognition = new Ctor() as SpeechRecognitionHandle;
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      this.zone.run(() => this.handleSpeechResult(event));
    };
    recognition.onerror = (event) => {
      this.zone.run(() => {
        const err = event.error || 'error';
        if (err === 'aborted' || err === 'no-speech') {
          return;
        }
        this.reciteStatus =
          err === 'not-allowed'
            ? 'Microphone permission blocked.'
            : `Mic error: ${err}`;
        if (err === 'not-allowed') {
          this.stopListening(true);
        }
      });
    };
    recognition.onend = () => {
      this.zone.run(() => {
        this.isListening = false;
        if (this.wantListening && this.recognition === recognition) {
          try {
            recognition.start();
            this.isListening = true;
          } catch {
            this.reciteStatus = 'Mic stopped. Tap Recite along to restart.';
            this.wantListening = false;
          }
        }
      });
    };

    this.recognition = recognition;
    try {
      recognition.start();
      this.isListening = true;
    } catch {
      this.reciteStatus = 'Could not start the microphone.';
      this.wantListening = false;
      this.recognition = null;
    }
  }

  private stopListening(clearTarget: boolean): void {
    this.wantListening = false;
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {
        /* ignore */
      }
      this.recognition = null;
    }
    if (clearTarget) {
      this.reciteAyah = 0;
      this.lastHeard = '';
      this.matchScore = 0;
      this.reciteStatus = '';
    } else if (this.reciteAyah) {
      this.reciteStatus = `Paused on ayah ${this.reciteAyah}.`;
    }
  }

  private handleSpeechResult(event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }): void {
    if (!this.wantListening || !this.reciteAyah) {
      return;
    }
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0]?.transcript || '';
    }
    transcript = transcript.trim();
    if (!transcript) {
      return;
    }
    this.lastHeard = transcript;
    const expected = this.reciteTargetText;
    if (!expected) {
      this.reciteStatus = 'Arabic text still loading…';
      return;
    }
    const score = arabicSimilarity(transcript, expected);
    this.matchScore = score;
    const pct = Math.round(score * 100);
    if (score >= this.matchThreshold) {
      this.reciteStatus = `Matched ayah ${this.reciteAyah} (${pct}%).`;
      this.advanceReciteTarget();
      return;
    }
    this.reciteStatus = `Listening ayah ${this.reciteAyah} · ${pct}% match`;
  }

  private advanceReciteTarget(): void {
    this.lastHeard = '';
    this.matchScore = 0;
    if (this.reciteAyah >= this.toAyah) {
      this.reciteStatus = `Range complete (${this.fromAyah}–${this.toAyah}).`;
      this.stopListening(false);
      return;
    }
    this.reciteAyah += 1;
    this.reciteStatus = `Listening for ayah ${this.reciteAyah}…`;
    this.emitMushaf(this.reciteAyah);
  }

  private emitMushaf(ayahNumber: number): void {
    const page = pageWithinSurahForAyah(
      this.surahNumber,
      ayahNumber,
      this.currentSurah.ayahCount
    );
    this.openMushaf.emit({ surahNumber: this.surahNumber, page });
  }

  onAudioEnded(): void {
    if (!this.isPlaying || this.isPaused || this.awaitingContinue) {
      return;
    }
    this.scheduleNext(this.ayahDelayMs, () => this.advanceAfterAyah());
  }

  onAudioError(): void {
    if (!this.isPlaying) {
      return;
    }
    this.statusMessage =
      'Could not load that verse audio from EveryAyah — skipping.';
    this.scheduleNext(300, () => this.advanceAfterAyah());
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
    this.sessionAudioChange.emit(true);
    const audio = this.playerRef?.nativeElement;
    if (audio?.getAttribute('src') && audio.paused && !audio.ended) {
      audio.playbackRate = this.playbackRate;
      audio.play().catch(() => this.playCurrentAyah());
      this.statusMessage = 'Resumed.';
      return;
    }
    this.playCurrentAyah();
  }

  private continueAfterPause(): void {
    this.awaitingContinue = false;
    this.isPlaying = true;
    this.isPaused = false;
    this.sessionAudioChange.emit(true);
    if (this.afterPause === 'replay') {
      this.ayahIndexInSet = 0;
      this.playCurrentAyah();
      return;
    }
    this.advanceToNextBlock();
  }

  private startSession(): void {
    this.stopListening(true);
    this.normalizeRange();
    this.sessionBlocks = this.intelliJMode
      ? this.buildIntelliJBlocks()
      : this.buildLoopBlocks();
    if (!this.sessionBlocks.length) {
      this.statusMessage = 'Nothing to play in that range.';
      return;
    }
    this.sessionToken += 1;
    this.isPlaying = true;
    this.isPaused = false;
    this.awaitingContinue = false;
    this.blockIndex = 0;
    this.ayahIndexInSet = 0;
    this.sessionAudioChange.emit(true);
    this.activateBlock(0);
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

  private buildLoopBlocks(): SessionBlock[] {
    const ayahs = range(this.fromAyah, this.toAyah);
    return [
      {
        ayahs,
        repeats: Math.max(1, this.loopRepeats),
        kind: 'set',
        label: labelFor(ayahs)
      }
    ];
  }

  /**
   * IntelliJ mode (Memorize Quran app):
   * For each new ayah A in a window starting at S:
   *   1) play [A] alone × newAyahRepeats
   *   2) if A > S, play range(S..A) × setRepeats
   * With moving window: after finishing S..(S+window-1), slide S forward by 1.
   */
  private buildIntelliJBlocks(): SessionBlock[] {
    const start = this.fromAyah;
    const end = this.toAyah;
    const window = Math.max(2, this.windowSize);
    const newReps = Math.max(1, this.newAyahRepeats);
    const setReps = Math.max(1, this.setRepeats);
    const blocks: SessionBlock[] = [];

    const buildWindow = (windowStart: number, windowEnd: number): void => {
      for (let ayah = windowStart; ayah <= windowEnd; ayah++) {
        blocks.push({
          ayahs: [ayah],
          repeats: newReps,
          kind: 'new',
          label: `New ayah ${ayah}`
        });
        if (ayah > windowStart) {
          const set = range(windowStart, ayah);
          blocks.push({
            ayahs: set,
            repeats: setReps,
            kind: 'set',
            label: labelFor(set)
          });
        }
      }
    };

    if (!this.movingWindow || end - start + 1 <= window) {
      buildWindow(start, end);
      return blocks;
    }

    for (
      let windowStart = start;
      windowStart + window - 1 <= end;
      windowStart++
    ) {
      buildWindow(windowStart, windowStart + window - 1);
    }
    return blocks;
  }

  private activateBlock(index: number): void {
    const block = this.sessionBlocks[index];
    this.blockIndex = index;
    this.setQueue = block?.ayahs ?? [];
    this.ayahIndexInSet = 0;
    this.setRepeat = 1;
    this.setRepeatTotal = block?.repeats ?? 0;
    this.blockKind = block?.kind ?? '';
    this.currentSetLabel = block?.label ?? '';
  }

  private playCurrentAyah(): void {
    const ayah = this.setQueue[this.ayahIndexInSet];
    const audio = this.playerRef?.nativeElement;
    if (!ayah || !audio) {
      return;
    }
    this.currentAyah = ayah;
    if (this.followMushaf) {
      this.emitMushaf(ayah);
    }
    const kindLabel = this.blockKind === 'new' ? 'New ayah' : 'Set';
    this.statusMessage = `${kindLabel}: ${this.currentSetLabel} · ${this.setRepeat}/${this.setRepeatTotal} · ayah ${ayah}`;
    audio.src = everyAyahUrl(this.surahNumber, ayah, this.reciterId);
    audio.load();
    audio.playbackRate = this.playbackRate;
    audio.play().catch(() => {
      this.statusMessage = 'Playback blocked — click Start again.';
      this.stopSession();
    });
  }

  private scheduleNext(delayMs: number, action: () => void): void {
    const token = this.sessionToken;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
    }
    this.delayTimer = setTimeout(() => {
      if (token !== this.sessionToken || this.isPaused || !this.isPlaying) {
        return;
      }
      if (this.awaitingContinue) {
        return;
      }
      action();
    }, Math.max(0, delayMs));
  }

  private advanceAfterAyah(): void {
    if (this.ayahIndexInSet + 1 < this.setQueue.length) {
      this.ayahIndexInSet += 1;
      this.playCurrentAyah();
      return;
    }

    // Finished one pass of the current block.
    if (this.setRepeat < this.setRepeatTotal) {
      this.setRepeat += 1;
      this.ayahIndexInSet = 0;
      if (this.shouldSequentialPause()) {
        this.enterSequentialPause(
          `Revise ${this.currentSetLabel} in your head…`,
          'replay'
        );
        return;
      }
      this.scheduleNext(this.ayahDelayMs, () => this.playCurrentAyah());
      return;
    }

    // Finished all repeats for this block.
    if (this.shouldSequentialPause() && this.blockKind === 'set') {
      this.enterSequentialPause(
        `Set done — revise ${this.currentSetLabel} in your head, then continue.`,
        'next-block'
      );
      return;
    }

    this.advanceToNextBlock();
  }

  private shouldSequentialPause(): boolean {
    return (
      this.intelliJMode &&
      this.sequentialPause &&
      this.setQueue.length > 1
    );
  }

  private enterSequentialPause(
    message: string,
    next: 'replay' | 'next-block'
  ): void {
    this.afterPause = next;
    this.awaitingContinue = true;
    this.statusMessage = message;
    const audio = this.playerRef?.nativeElement;
    audio?.pause();

    // Auto-continue after the pause duration (user can also tap Continue).
    const token = this.sessionToken;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
    }
    this.delayTimer = setTimeout(() => {
      if (token !== this.sessionToken || !this.awaitingContinue) {
        return;
      }
      this.continueAfterPause();
    }, Math.max(500, this.sequentialPauseMs));
  }

  private advanceToNextBlock(): void {
    if (this.blockIndex + 1 < this.sessionBlocks.length) {
      this.activateBlock(this.blockIndex + 1);
      this.playCurrentAyah();
      return;
    }
    this.statusMessage = 'Session complete.';
    this.isPlaying = false;
    this.isPaused = false;
    this.awaitingContinue = false;
    this.currentAyah = 0;
    this.setQueue = [];
    this.blockKind = '';
    this.sessionAudioChange.emit(false);
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

function labelFor(ayahs: number[]): string {
  if (!ayahs.length) {
    return '';
  }
  if (ayahs.length === 1) {
    return `Ayah ${ayahs[0]}`;
  }
  return `Ayahs ${ayahs[0]}–${ayahs[ayahs.length - 1]}`;
}
