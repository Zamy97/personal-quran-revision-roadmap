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
  documentPageForSurah,
  mushafPdfUrlForSurah,
  mushafViewerUrl as buildMushafViewerUrl,
  pageCountForSurah
} from '../../data/mushaf-pages';
import {
  DEFAULT_RECITER_ID,
  RECITERS,
  getReciter
} from '../../data/reciters';
import { SURAHS, Surah, formatSurahName, getSurah, surahLabel } from '../../data/surahs';
import {
  MemorizationProgress,
  todayKey
} from '../../models/progress.model';
import { ProgressService } from '../../services/progress.service';
import {
  PDFDocumentProxy,
  RenderTask,
  getDocument
} from 'pdfjs-dist';
import { configurePdfWorker } from '../../pdf-worker';

configurePdfWorker();

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

  progress: MemorizationProgress;
  todayLabel = '';
  todayWeekday = '';
  /** Calendar weekday’s manzil (always “today”). */
  todayManzil!: ManzilDay;
  /**
   * Manzil shown in Listen / Play all. Defaults to today; session-only
   * (reload always lands on the calendar day again).
   */
  selectedManzil!: ManzilDay;
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
  mushafLoading = false;
  mushafError = '';
  /** Side-by-side spread (RTL: right = current, left = next). */
  mushafTwoPage = true;
  /** Keep mushaf open and flip pages while audio plays. */
  mushafFollowAudio = true;
  private mushafFollowSuspended = false;
  private lastFollowSyncedPage: number | null = null;

  /** Scroll hint for the surah list */
  showScrollHint = false;
  hiddenSurahCount = 0;
  darkMode = false;

  /** Session-only Play all repeats per surah number (default 1). */
  private readonly repeatBySurah = new Map<number, number>();
  private readonly themeStorageKey = 'quran-revision-theme';
  private pdfDoc: PDFDocumentProxy | null = null;
  private pdfLoadPromise: Promise<PDFDocumentProxy> | null = null;
  private loadedPdfUrl: string | null = null;
  private mushafRenderToken = 0;
  private rightRenderTask: RenderTask | null = null;
  private leftRenderTask: RenderTask | null = null;
  private mushafDomRetry = 0;

  @ViewChild('player') playerRef?: ElementRef<HTMLAudioElement>;
  @ViewChild('surahList') surahListRef?: ElementRef<HTMLUListElement>;
  @ViewChild('mushafCanvas') mushafCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('mushafCanvasLeft') mushafCanvasLeftRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('mushafPageWrap') mushafPageWrapRef?: ElementRef<HTMLDivElement>;

  private sub?: Subscription;
  private statusTimer?: ReturnType<typeof setTimeout>;
  /** YYYY-MM-DD last applied as “today” (detects overnight / idle tabs). */
  private calendarDateKey = '';
  private dayWatchTimer?: ReturnType<typeof setInterval>;
  private midnightTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly progressService: ProgressService) {
    this.progress = this.progressService.snapshot;
    this.syncDerivedState(this.progress);
    this.darkMode = this.readStoredTheme();
    this.applyTheme(this.darkMode);
  }

  ngOnInit(): void {
    this.syncCalendarDay(true);
    this.startDayWatcher();
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
    if (this.mushafOpen) {
      void this.renderMushafPage();
    }
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.syncCalendarDay();
  }

  @HostListener('document:visibilitychange')
  onDocumentVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.syncCalendarDay();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.mushafOpen || this.mushafLoading) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.key === 'Escape') {
      this.closeMushaf();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      void this.shiftMushafPage(-1);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      void this.shiftMushafPage(1);
    }
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
    this.stopDayWatcher();
    this.mushafRenderToken += 1;
    void this.cancelMushafRenders();
    void this.pdfDoc?.destroy();
    this.pdfDoc = null;
    this.pdfLoadPromise = null;
    this.loadedPdfUrl = null;
  }

  get currentSurah(): Surah | undefined {
    return getSurah(this.progress.currentSurahNumber);
  }

  get canAdvanceSurah(): boolean {
    const surah = this.currentSurah;
    return !!surah && this.progress.currentAyah >= surah.ayahCount;
  }

  /** Surahs for the selected manzil day (Listen / Play all / Mushaf list). */
  get todaySurahs(): Surah[] {
    const numbers = this.selectedManzil?.surahNumbers ?? [];
    return numbers
      .map((n) => getSurah(n))
      .filter((s): s is Surah => !!s)
      .sort((a, b) => a.number - b.number);
  }

  get isViewingToday(): boolean {
    return this.selectedManzil?.dayIndex === this.todayManzil?.dayIndex;
  }

  /** Switch which day’s surahs appear in Listen / Play all (not persisted). */
  selectRevisionDay(day: ManzilDay): void {
    if (day.dayIndex === this.selectedManzil?.dayIndex) {
      return;
    }
    this.stopPlaybackForDayChange();
    this.selectedManzil = day;
    this.flash(
      this.isViewingToday
        ? `Back to today’s revision (${day.day}).`
        : `Viewing ${day.day}’s revision.`
    );
    queueMicrotask(() => this.updateScrollHint());
  }

  onRevisionDayChange(dayIndex: number): void {
    const day =
      this.manzilLoop.find((d) => d.dayIndex === Number(dayIndex)) ||
      this.todayManzil;
    this.selectRevisionDay(day);
  }

  private stopPlaybackForDayChange(): void {
    const audio = this.playerRef?.nativeElement;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.sequenceMode = false;
    this.sequenceRep = 1;
    this.playingSurah = null;
    this.isAudioPlaying = false;
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

  get mushafViewerHref(): string {
    return buildMushafViewerUrl(
      this.mushafPage,
      this.mushafSurahNumber ?? undefined
    );
  }

  get mushafSurahLabel(): string {
    if (!this.mushafSurahNumber) {
      return 'Tajweed Mushaf';
    }
    return formatSurahName(this.mushafSurahNumber);
  }

  get mushafPageMin(): number {
    return 1;
  }

  get mushafPageMax(): number {
    if (this.mushafSurahNumber) {
      return pageCountForSurah(this.mushafSurahNumber);
    }
    return 1;
  }

  get mushafPageStep(): number {
    return this.mushafTwoPage ? 2 : 1;
  }

  get mushafPageLabel(): string {
    const max = this.mushafPageMax;
    if (this.showMushafLeftPage) {
      return `Pages ${this.mushafPage}–${this.mushafPage + 1} / ${max}`;
    }
    return `Page ${this.mushafPage} / ${max}`;
  }

  get showMushafLeftPage(): boolean {
    return this.mushafTwoPage && this.mushafPage < this.mushafPageMax;
  }

  get canGoPrevMushafPage(): boolean {
    return this.mushafPage > this.mushafPageMin;
  }

  get canGoNextMushafPage(): boolean {
    if (this.mushafTwoPage) {
      // Next spread, or the leftover last page when page count is odd.
      return this.mushafPage + 1 < this.mushafPageMax;
    }
    return this.mushafPage < this.mushafPageMax;
  }

  get mushafFollowLabel(): string {
    if (!this.mushafFollowAudio) {
      return 'Follow along off';
    }
    if (this.mushafFollowSuspended) {
      return 'Follow along paused';
    }
    return 'Follow along on';
  }

  get isMushafFollowPressed(): boolean {
    return this.mushafFollowAudio && !this.mushafFollowSuspended;
  }

  toggleMushafTwoPage(): void {
    this.mushafTwoPage = !this.mushafTwoPage;
    this.mushafPage = this.normalizeMushafPage(this.mushafPage);
    this.lastFollowSyncedPage = null;
    this.scheduleMushafRender();
  }

  toggleMushafFollowAudio(): void {
    // Resume a paused follow-along without turning the preference off.
    if (this.mushafFollowAudio && this.mushafFollowSuspended) {
      this.mushafFollowSuspended = false;
      if (this.playingSurah != null) {
        this.ensureMushafFollowsSurah(this.playingSurah);
        this.onAudioTimeUpdate();
      }
      return;
    }

    this.mushafFollowAudio = !this.mushafFollowAudio;
    if (this.mushafFollowAudio && this.playingSurah != null) {
      this.mushafFollowSuspended = false;
      this.ensureMushafFollowsSurah(this.playingSurah);
      this.onAudioTimeUpdate();
    }
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
    if (this.mushafFollowAudio && this.playingSurah != null) {
      this.ensureMushafFollowsSurah(this.playingSurah);
    }
  }

  onAudioPause(): void {
    this.isAudioPlaying = false;
  }

  onAudioTimeUpdate(): void {
    if (!this.mushafFollowAudio || this.mushafFollowSuspended) {
      return;
    }
    if (!this.mushafOpen || this.playingSurah == null) {
      return;
    }
    if (this.mushafSurahNumber !== this.playingSurah) {
      return;
    }
    const audio = this.playerRef?.nativeElement;
    if (!audio || !audio.duration || !isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    const pageCount = pageCountForSurah(this.playingSurah);
    const progress = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
    // Map playback position onto surah pages (no ayah timestamps available).
    let page = Math.min(
      pageCount,
      Math.max(1, Math.floor(progress * pageCount) + 1)
    );
    page = this.normalizeMushafPage(page);
    if (page === this.lastFollowSyncedPage && page === this.mushafPage) {
      return;
    }
    this.lastFollowSyncedPage = page;
    if (page !== this.mushafPage) {
      this.mushafPage = page;
      this.scheduleMushafRender();
    }
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
    this.flash(
      this.isViewingToday
        ? 'Today’s revision sequence is complete.'
        : `${this.selectedManzil.day}’s revision sequence is complete.`
    );
  }

  openMushaf(surahNumber: number): void {
    this.mushafSurahNumber = surahNumber;
    this.mushafPage = this.normalizeMushafPage(1);
    this.mushafError = '';
    this.mushafOpen = true;
    this.lastFollowSyncedPage = null;
    // Reopening the playing surah should resume follow-along.
    if (this.mushafFollowAudio && this.playingSurah === surahNumber) {
      this.mushafFollowSuspended = false;
      this.scheduleMushafRender();
      this.onAudioTimeUpdate();
      return;
    }
    this.scheduleMushafRender();
  }

  closeMushaf(): void {
    this.mushafOpen = false;
    this.mushafRenderToken += 1;
    void this.cancelMushafRenders();
    // Closing while listening pauses auto-follow until the next play.
    if (this.isAudioPlaying || this.playingSurah != null) {
      this.mushafFollowSuspended = true;
    }
  }

  async shiftMushafPage(delta: number): Promise<void> {
    if (delta === 0) {
      return;
    }
    const step = this.mushafPageStep;
    const direction = delta > 0 ? 1 : -1;
    let next = this.mushafPage + direction * step;

    if (direction > 0 && this.mushafTwoPage) {
      // From last full spread, land on the final leftover page when odd count.
      const max = this.mushafPageMax;
      if (this.mushafPage < max && next > max) {
        next = max;
      }
    }

    next = this.normalizeMushafPage(next);
    if (next === this.mushafPage) {
      return;
    }

    // Manual flip pauses follow-along so audio sync doesn't yank the page back.
    if (this.mushafFollowAudio) {
      this.mushafFollowSuspended = true;
    }
    this.mushafPage = next;
    this.lastFollowSyncedPage = next;
    await this.renderMushafPage();
  }

  /**
   * Keep two-page mode on odd right-hand starts (1–2, 3–4, …).
   * Even pages always snap back into their pair — including the last page
   * of an even-length surah (e.g. Fajr page 2 → show 1–2 again).
   * A lone last page is only valid when the page count is odd (e.g. 5 of 5).
   */
  private normalizeMushafPage(page: number): number {
    const min = this.mushafPageMin;
    const max = this.mushafPageMax;
    let p = Math.max(min, Math.min(max, Math.floor(page) || min));
    if (this.mushafTwoPage && max > 1 && p % 2 === 0) {
      p -= 1;
    }
    return Math.max(min, Math.min(max, p));
  }

  private scheduleMushafRender(): void {
    // Double rAF: wait for *ngIf left canvas / layout after mode toggles.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void this.renderMushafPage();
      });
    });
  }

  private async ensurePdf(): Promise<PDFDocumentProxy> {
    const surah = this.mushafSurahNumber || 1;
    const url = mushafPdfUrlForSurah(surah);

    if (this.pdfDoc && this.loadedPdfUrl === url) {
      return this.pdfDoc;
    }

    // Drop a stale document when switching surahs.
    if (this.pdfDoc) {
      try {
        await this.pdfDoc.destroy();
      } catch {
        /* ignore */
      }
      this.pdfDoc = null;
    }

    // Abandon an in-flight load for a different surah (Play all / quick switch).
    if (this.pdfLoadPromise && this.loadedPdfUrl !== url) {
      this.pdfLoadPromise = null;
      this.loadedPdfUrl = null;
    }

    if (!this.pdfLoadPromise) {
      this.mushafError = '';
      this.loadedPdfUrl = url;
      const loadUrl = url;
      this.pdfLoadPromise = getDocument({
        url,
        // Range requests avoid pulling the whole file before the first page.
        disableAutoFetch: true,
        disableStream: false
      })
        .promise.then(async (doc) => {
          // Another surah may have started loading while we waited.
          if (this.loadedPdfUrl !== loadUrl) {
            try {
              await doc.destroy();
            } catch {
              /* ignore */
            }
            throw new Error('Stale mushaf PDF load');
          }
          this.pdfDoc = doc;
          return doc;
        })
        .catch((err: unknown) => {
          if (this.loadedPdfUrl === loadUrl) {
            this.pdfLoadPromise = null;
            this.loadedPdfUrl = null;
            this.mushafError =
              'Could not load the mushaf PDF. Check the Blob URL / local file.';
          }
          throw err;
        });
    }
    return this.pdfLoadPromise;
  }

  private async renderMushafPage(): Promise<void> {
    if (!this.mushafOpen) {
      return;
    }
    const token = ++this.mushafRenderToken;
    this.mushafLoading = true;
    this.mushafError = '';
    let waitingForDom = false;
    try {
      const doc = await this.ensurePdf();
      if (token !== this.mushafRenderToken || !this.mushafOpen) {
        return;
      }
      const rightCanvas = this.mushafCanvasRef?.nativeElement;
      const leftCanvas = this.mushafCanvasLeftRef?.nativeElement;
      const wrap = this.mushafPageWrapRef?.nativeElement;
      if (!rightCanvas || !wrap) {
        if (this.mushafDomRetry < 8) {
          this.mushafDomRetry += 1;
          waitingForDom = true;
          this.scheduleMushafRender();
        } else {
          this.mushafError = 'Could not render this mushaf page.';
        }
        return;
      }

      // Layout not ready yet (overlay still measuring) — retry instead of
      // painting a tiny/blank page.
      if (wrap.clientWidth < 40 || wrap.clientHeight < 40) {
        if (this.mushafDomRetry < 8) {
          this.mushafDomRetry += 1;
          waitingForDom = true;
          this.scheduleMushafRender();
        }
        return;
      }

      // Left canvas mounts via *ngIf when entering spread mode — wait for it.
      if (this.showMushafLeftPage && !leftCanvas) {
        if (this.mushafDomRetry < 8) {
          this.mushafDomRetry += 1;
          waitingForDom = true;
          this.scheduleMushafRender();
        } else {
          this.mushafError = 'Could not render this mushaf page.';
        }
        return;
      }
      this.mushafDomRetry = 0;

      const surah = this.mushafSurahNumber || 1;
      this.mushafPage = this.normalizeMushafPage(this.mushafPage);
      const rightPageNum = documentPageForSurah(surah, this.mushafPage);
      const showLeft = this.showMushafLeftPage && !!leftCanvas;
      const gap = showLeft ? 12 : 0;
      const pageSlots = showLeft ? 2 : 1;
      const maxWidth = Math.max(
        160,
        (wrap.clientWidth - 16 - gap) / pageSlots
      );
      const maxHeight = Math.max(320, wrap.clientHeight - 16);

      await this.paintPdfPage(
        doc,
        rightPageNum,
        rightCanvas,
        maxWidth,
        maxHeight,
        'right'
      );
      if (token !== this.mushafRenderToken || !this.mushafOpen) {
        return;
      }

      if (showLeft && leftCanvas) {
        const leftPageNum = documentPageForSurah(surah, this.mushafPage + 1);
        await this.paintPdfPage(
          doc,
          leftPageNum,
          leftCanvas,
          maxWidth,
          maxHeight,
          'left'
        );
      } else {
        await this.cancelRenderSide('left');
      }
    } catch (err: unknown) {
      // Ignore superseded loads while switching surahs quickly.
      const message = err instanceof Error ? err.message : '';
      if (message === 'Stale mushaf PDF load') {
        return;
      }
      if (token === this.mushafRenderToken) {
        this.mushafError =
          this.mushafError || 'Could not render this mushaf page.';
      }
    } finally {
      if (token === this.mushafRenderToken && !waitingForDom) {
        this.mushafLoading = false;
      }
    }
  }

  private async cancelMushafRenders(): Promise<void> {
    await Promise.all([
      this.cancelRenderSide('right'),
      this.cancelRenderSide('left')
    ]);
  }

  private async cancelRenderSide(side: 'left' | 'right'): Promise<void> {
    const task =
      side === 'left' ? this.leftRenderTask : this.rightRenderTask;
    if (side === 'left') {
      this.leftRenderTask = null;
    } else {
      this.rightRenderTask = null;
    }
    if (!task) {
      return;
    }
    try {
      task.cancel();
      await task.promise.catch(() => undefined);
    } catch {
      /* ignore cancel races */
    }
  }

  private async paintPdfPage(
    doc: PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    maxWidth: number,
    maxHeight: number,
    side: 'left' | 'right'
  ): Promise<void> {
    await this.cancelRenderSide(side);

    if (pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(`Mushaf page ${pageNumber} is out of range`);
    }

    const page = await doc.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(maxWidth / base.width, maxHeight / base.height);
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const transform =
        outputScale !== 1
          ? ([outputScale, 0, 0, outputScale, 0, 0] as const)
          : undefined;
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: transform ? [...transform] : undefined
      });
      if (side === 'left') {
        this.leftRenderTask = task;
      } else {
        this.rightRenderTask = task;
      }
      try {
        await task.promise;
      } catch (err: unknown) {
        // PDF.js rejects cancelled renders — ignore those.
        const name =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name: string }).name)
            : '';
        if (name !== 'RenderingCancelledException') {
          throw err;
        }
      } finally {
        if (side === 'left' && this.leftRenderTask === task) {
          this.leftRenderTask = null;
        }
        if (side === 'right' && this.rightRenderTask === task) {
          this.rightRenderTask = null;
        }
      }
    } finally {
      try {
        page.cleanup();
      } catch {
        /* ignore */
      }
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
    this.lastFollowSyncedPage = null;
    if (this.mushafFollowAudio) {
      this.mushafFollowSuspended = false;
      this.ensureMushafFollowsSurah(surahNumber);
    }
    audio.play().catch(() => {
      this.isAudioPlaying = false;
      this.flash('Could not play audio — check your connection.');
    });
  }

  /** Open (or switch) mushaf to the surah currently playing. */
  private ensureMushafFollowsSurah(surahNumber: number): void {
    if (this.mushafFollowSuspended) {
      return;
    }
    if (this.mushafOpen && this.mushafSurahNumber === surahNumber) {
      return;
    }
    this.mushafSurahNumber = surahNumber;
    this.mushafPage = this.normalizeMushafPage(1);
    this.mushafError = '';
    this.mushafOpen = true;
    this.lastFollowSyncedPage = this.mushafPage;
    this.scheduleMushafRender();
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

  /**
   * Keep manzil “today” in sync when the tab stays open past midnight
   * or is focused again the next day without a full reload.
   */
  private syncCalendarDay(isInitial = false): void {
    const key = todayKey();
    if (key === this.calendarDateKey) {
      return;
    }

    const rolledOver = !!this.calendarDateKey && !isInitial;
    this.calendarDateKey = key;
    this.refreshClockLabels();
    this.todayManzil =
      this.manzilLoop.find((d) => d.dayIndex === new Date().getDay()) ||
      this.manzilLoop[6];

    if (rolledOver) {
      this.stopPlaybackForDayChange();
      this.progressService.refreshForNewDay();
    }

    this.selectedManzil = this.todayManzil;

    if (rolledOver) {
      this.flash(`New day — now on ${this.todayManzil.day}’s revision.`);
      queueMicrotask(() => this.updateScrollHint());
    }
  }

  private startDayWatcher(): void {
    this.stopDayWatcher();
    // Cheap backup if focus/visibility events are missed.
    this.dayWatchTimer = setInterval(() => this.syncCalendarDay(), 60_000);
    this.scheduleMidnightTick();
  }

  private scheduleMidnightTick(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 1, 0);
    this.midnightTimer = setTimeout(() => {
      this.syncCalendarDay();
      this.scheduleMidnightTick();
    }, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
  }

  private stopDayWatcher(): void {
    if (this.dayWatchTimer) {
      clearInterval(this.dayWatchTimer);
      this.dayWatchTimer = undefined;
    }
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = undefined;
    }
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
