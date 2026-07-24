import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  DAILY_BLUEPRINT,
  DailyBlueprintItem,
  ManzilDay,
  RETENTION_REMINDERS,
  WEEKLY_MANZIL,
  isCoreManzilSurah
} from '../../data/revision-plan';
import {
  TOTAL_MUSHAF_PAGES,
  mushafPageImageUrl,
  startPageForSurah
} from '../../data/mushaf-pages';
import {
  DEFAULT_RECITER_ID,
  RECITERS,
  getReciter
} from '../../data/reciters';
import { SURAHS, Surah, formatSurahName, getSurah, surahLabel } from '../../data/surahs';
import { MemorizationProgress } from '../../models/progress.model';
import { ProgressService } from '../../services/progress.service';

@Component({
  selector: 'app-roadmap',
  templateUrl: './roadmap.component.html',
  styleUrl: './roadmap.component.css'
})
export class RoadmapComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly blueprint = DAILY_BLUEPRINT;
  readonly reminders = RETENTION_REMINDERS;
  readonly manzilLoop: ManzilDay[] = WEEKLY_MANZIL;
  readonly surahLabel = surahLabel;
  readonly totalTasks = DAILY_BLUEPRINT.length;
  readonly reciters = RECITERS;
  readonly totalMushafPages = TOTAL_MUSHAF_PAGES;

  progress: MemorizationProgress;
  todayLabel = '';
  todayWeekday = '';
  todayManzil!: ManzilDay;
  ayahOptions: number[] = [];
  statusMessage = '';
  playingSurah: number | null = null;
  isAudioPlaying = false;
  sequenceMode = false;
  /** Current play number within a surah during Play all (1-based). */
  sequenceRep = 1;
  selectedReciterId = DEFAULT_RECITER_ID;
  /** Choices for how many times a surah plays in Play all. */
  readonly repeatChoices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /** Inline mushaf viewer state */
  mushafOpen = false;
  mushafPage = 1;
  mushafSurahNumber: number | null = null;

  /** Scroll hint for the surah list */
  showScrollHint = false;
  hiddenSurahCount = 0;
  darkMode = false;

  /** Session-only Play all repeats per surah number (default 1). */
  private readonly repeatBySurah = new Map<number, number>();
  private readonly themeStorageKey = 'quran-revision-theme';

  @ViewChild('player') playerRef?: ElementRef<HTMLAudioElement>;
  @ViewChild('surahList') surahListRef?: ElementRef<HTMLUListElement>;

  private sub?: Subscription;
  private statusTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly progressService: ProgressService) {
    this.progress = this.progressService.snapshot;
    this.syncDerivedState(this.progress);
    this.darkMode = this.readStoredTheme();
    this.applyTheme(this.darkMode);
  }

  ngOnInit(): void {
    this.refreshClockLabels();
    this.todayManzil =
      this.manzilLoop.find((d) => d.dayIndex === new Date().getDay()) ||
      this.manzilLoop[6];
    this.sub = this.progressService.progress$.subscribe((progress) => {
      this.progress = progress;
      this.syncDerivedState(progress);
    });
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    this.applyTheme(this.darkMode);
    try {
      localStorage.setItem(
        this.themeStorageKey,
        this.darkMode ? 'dark' : 'light'
      );
    } catch {
      /* ignore quota / private mode */
    }
    this.flash(this.darkMode ? 'Dark mode on.' : 'Light mode on.');
  }

  private readStoredTheme(): boolean {
    try {
      const stored = localStorage.getItem(this.themeStorageKey);
      if (stored === 'dark') {
        return true;
      }
      if (stored === 'light') {
        return false;
      }
    } catch {
      /* ignore */
    }
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  }

  private applyTheme(dark: boolean): void {
    document.documentElement.classList.toggle('dark', dark);
  }

  ngAfterViewInit(): void {
    // Let the list render first, then check whether it overflows.
    setTimeout(() => this.updateScrollHint());
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateScrollHint();
  }

  updateScrollHint(): void {
    const el = this.surahListRef?.nativeElement;
    if (!el) {
      this.showScrollHint = false;
      this.hiddenSurahCount = 0;
      return;
    }
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.showScrollHint = remaining > 8;

    if (this.showScrollHint) {
      const items = Array.from(el.querySelectorAll('li'));
      const visibleBottom = el.scrollTop + el.clientHeight;
      this.hiddenSurahCount = items.filter(
        (li) => li.offsetTop + li.offsetHeight / 2 > visibleBottom
      ).length;
    } else {
      this.hiddenSurahCount = 0;
    }
  }

  scrollSurahList(): void {
    const el = this.surahListRef?.nativeElement;
    if (!el) {
      return;
    }
    el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }
  }

  get currentSurah(): Surah | undefined {
    return getSurah(this.progress.currentSurahNumber);
  }

  get canAdvanceSurah(): boolean {
    const surah = this.currentSurah;
    return !!surah && this.progress.currentAyah >= surah.ayahCount;
  }

  /** Surahs scheduled for today's manzil, for the listen / mushaf panel. */
  get todaySurahs(): Surah[] {
    const numbers = this.todayManzil?.surahNumbers ?? [];
    return numbers
      .map((n) => getSurah(n))
      .filter((s): s is Surah => !!s)
      .sort((a, b) => a.number - b.number);
  }

  get sequenceButtonLabel(): string {
    if (!this.sequenceMode) {
      return '▶ Play all';
    }
    return this.isAudioPlaying ? '❚❚ Pause all' : '▶ Resume all';
  }

  getRepeatCount(surahNumber: number): number {
    return this.repeatBySurah.get(surahNumber) ?? 1;
  }

  setRepeat(surahNumber: number, raw: number | string): void {
    const next = Math.min(10, Math.max(1, Number(raw) || 1));
    if (next === 1) {
      this.repeatBySurah.delete(surahNumber);
    } else {
      this.repeatBySurah.set(surahNumber, next);
    }
    this.flash(
      next === 1
        ? `${formatSurahName(surahNumber)} will play once in Play all.`
        : `${formatSurahName(surahNumber)} will play ×${next} in Play all.`
    );
  }

  sequenceProgressLabel(surahNumber: number): string {
    const total = this.getRepeatCount(surahNumber);
    if (this.playingSurah !== surahNumber || total <= 1) {
      return '';
    }
    return `${this.sequenceRep}/${total}`;
  }

  get mushafImageUrl(): string {
    return mushafPageImageUrl(this.mushafPage);
  }

  get mushafSurahLabel(): string {
    if (!this.mushafSurahNumber) {
      return '';
    }
    return formatSurahName(this.mushafSurahNumber);
  }

  audioUrl(surahNumber: number): string {
    return getReciter(this.selectedReciterId).audioUrl(surahNumber);
  }

  onReciterChange(id: string): void {
    this.selectedReciterId = id;
    if (this.playingSurah != null) {
      const surah = this.playingSurah;
      const audio = this.playerRef?.nativeElement;
      if (audio) {
        const wasPlaying = !audio.paused;
        const t = audio.currentTime;
        audio.src = this.audioUrl(surah);
        audio.load();
        if (wasPlaying) {
          audio.currentTime = 0;
          audio.play().catch(() => undefined);
        } else {
          audio.currentTime = t;
        }
      }
    }
    this.flash(`Reciter: ${getReciter(id).label}`);
  }

  playSurah(surahNumber: number): void {
    const audio = this.playerRef?.nativeElement;
    if (!audio) {
      return;
    }
    this.sequenceMode = false;
    this.sequenceRep = 1;
    if (this.playingSurah === surahNumber && !audio.paused) {
      audio.pause();
      return;
    }
    this.startAudio(surahNumber);
  }

  toggleSequence(): void {
    const audio = this.playerRef?.nativeElement;
    if (!audio || !this.todaySurahs.length) {
      return;
    }

    if (this.sequenceMode) {
      if (audio.paused) {
        audio.play().catch(() => {
          this.flash('Could not resume audio — check your connection.');
        });
      } else {
        audio.pause();
      }
      return;
    }

    this.sequenceMode = true;
    this.sequenceRep = 1;
    this.startAudio(this.todaySurahs[0].number);
    this.scrollPlayingSurahIntoView();
  }

  onAudioPlay(): void {
    this.isAudioPlaying = true;
  }

  onAudioPause(): void {
    this.isAudioPlaying = false;
  }

  onAudioEnded(): void {
    this.isAudioPlaying = false;
    if (this.playingSurah == null) {
      return;
    }

    const current = this.playingSurah;
    const needed = this.getRepeatCount(current);
    if (this.sequenceRep < needed) {
      this.sequenceRep += 1;
      this.startAudio(current);
      this.flash(
        `${formatSurahName(current)} — repeat ${this.sequenceRep} of ${needed}`
      );
      return;
    }

    // Finished all repeats for this surah.
    this.sequenceRep = 1;

    if (!this.sequenceMode) {
      this.playingSurah = null;
      return;
    }

    const currentIndex = this.todaySurahs.findIndex(
      (surah) => surah.number === current
    );
    const nextSurah = this.todaySurahs[currentIndex + 1];
    if (nextSurah) {
      this.startAudio(nextSurah.number);
      this.scrollPlayingSurahIntoView();
      return;
    }

    this.sequenceMode = false;
    this.playingSurah = null;
    this.flash('Today’s revision sequence is complete.');
  }

  openMushaf(surahNumber: number): void {
    this.mushafSurahNumber = surahNumber;
    this.mushafPage = startPageForSurah(surahNumber);
    this.mushafOpen = true;
  }

  closeMushaf(): void {
    this.mushafOpen = false;
  }

  mushafPrev(): void {
    if (this.mushafPage > 1) {
      this.mushafPage -= 1;
    }
  }

  mushafNext(): void {
    if (this.mushafPage < TOTAL_MUSHAF_PAGES) {
      this.mushafPage += 1;
    }
  }

  /** Phase picker hides surahs already covered by the weekly plan. */
  get phaseOptions(): Surah[] {
    const current = this.progress.currentSurahNumber;
    return SURAHS.filter(
      (s) => s.number === current || !isCoreManzilSurah(s.number)
    );
  }

  taskCopy(item: DailyBlueprintItem): string {
    const phase = this.progress?.currentPhase || 'current surah';
    const ayah = this.progress?.currentAyah || 0;

    switch (item.id) {
      case 'sabaqSabqi': {
        const sabqi =
          ayah > 0
            ? `recite ${phase} from verse 1 to ayah ${ayah}`
            : `recite ${phase} from verse 1 to today's lines`;
        return `First 15m: memorize 2–3 new lines of ${phase}. Next 15m: ${sabqi}, plus the last surah you fully finished.`;
      }
      case 'manzil':
        return `Follow today's day-by-day schedule: ${this.todayManzil.focusTitle}.`;
      default:
        return '';
    }
  }

  isDone(item: DailyBlueprintItem): boolean {
    return !!this.progress?.daily?.[item.id];
  }

  toggle(item: DailyBlueprintItem): void {
    this.progressService.toggleTask(item.id);
  }

  onPhaseChange(raw: string): void {
    const number = Number(raw);
    this.progressService.setCurrentSurah(number);
    this.flash(`Phase set to ${formatSurahName(number)}.`);
  }

  onAyahChange(raw: string): void {
    this.progressService.setCurrentAyah(Number(raw));
    this.flash('Ayah progress updated.');
  }

  advanceSurah(): void {
    const finished = formatSurahName(this.progress.currentSurahNumber);
    const advanced = this.progressService.advanceToNextSurah();
    this.flash(
      advanced
        ? `${finished} done. Moved to the next surah.`
        : `${finished} done. You reached the end of the mushaf list.`
    );
  }

  markAllDone(): void {
    this.progressService.markAllDone();
    this.flash('All daily tasks marked complete.');
  }

  resetToday(): void {
    this.progressService.resetToday();
    this.flash('Today\'s checklist cleared.');
  }

  downloadBackup(): void {
    const blob = new Blob([this.progressService.exportJson()], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quran-revision-backup-${this.progress.daily.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.flash('Backup downloaded.');
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const ok = this.progressService.importJson(String(reader.result || ''));
      this.flash(ok ? 'Backup restored.' : 'Could not import that file.');
      input.value = '';
    };
    reader.readAsText(file);
  }

  completedCount(): number {
    const d = this.progress?.daily;
    if (!d) {
      return 0;
    }
    return Number(d.sabaqSabqi) + Number(d.manzil);
  }

  private syncDerivedState(progress: MemorizationProgress): void {
    const surah = getSurah(progress.currentSurahNumber);
    this.ayahOptions = surah
      ? Array.from({ length: surah.ayahCount + 1 }, (_, i) => i)
      : [0];
  }

  private startAudio(surahNumber: number): void {
    const audio = this.playerRef?.nativeElement;
    if (!audio) {
      return;
    }
    audio.src = this.audioUrl(surahNumber);
    this.playingSurah = surahNumber;
    audio.play().catch(() => {
      this.isAudioPlaying = false;
      this.flash('Could not play audio — check your connection.');
    });
  }

  private scrollPlayingSurahIntoView(): void {
    setTimeout(() => {
      const item = this.surahListRef?.nativeElement.querySelector(
        'li.playing'
      );
      item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      this.updateScrollHint();
    });
  }

  private refreshClockLabels(): void {
    const now = new Date();
    this.todayLabel = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    this.todayWeekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  }

  private flash(message: string): void {
    this.statusMessage = message;
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }
    this.statusTimer = setTimeout(() => {
      this.statusMessage = '';
    }, 2800);
  }
}
