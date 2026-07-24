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
import { MemorizationProgress } from '../../models/progress.model';
import { ProgressService } from '../../services/progress.service';
import {
  GlobalWorkerOptions,
  PDFDocumentProxy,
  getDocument
} from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = '/assets/quran/pdf.worker.min.mjs';

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

  @ViewChild('player') playerRef?: ElementRef<HTMLAudioElement>;
  @ViewChild('surahList') surahListRef?: ElementRef<HTMLUListElement>;
  @ViewChild('mushafCanvas') mushafCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('mushafCanvasLeft') mushafCanvasLeftRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('mushafPageWrap') mushafPageWrapRef?: ElementRef<HTMLDivElement>;

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
    if (this.mushafOpen) {
      void this.renderMushafPage();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.mushafOpen) {
      return;
    }
    if (event.key === 'Escape') {
      this.closeMushaf();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      void this.shiftMushafPage(-this.mushafPageStep);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      void this.shiftMushafPage(this.mushafPageStep);
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
    void this.pdfDoc?.destroy();
    this.pdfDoc = null;
    this.pdfLoadPromise = null;
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
    if (this.mushafTwoPage && this.mushafPage < max) {
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
    return this.mushafPage < this.mushafPageMax;
  }

  toggleMushafTwoPage(): void {
    this.mushafTwoPage = !this.mushafTwoPage;
    // Left canvas mounts via *ngIf; wait a tick before painting.
    setTimeout(() => void this.renderMushafPage(), 0);
  }

  toggleMushafFollowAudio(): void {
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
    if (this.mushafTwoPage && pageCount > 1) {
      // Keep spreads on odd starts: 1–2, 3–4, …
      page = page % 2 === 0 ? page - 1 : page;
      page = Math.max(1, page);
    }
    if (page === this.lastFollowSyncedPage && page === this.mushafPage) {
      return;
    }
    this.lastFollowSyncedPage = page;
    if (page !== this.mushafPage) {
      this.mushafPage = page;
      void this.renderMushafPage();
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
    this.flash('Today’s revision sequence is complete.');
  }

  openMushaf(surahNumber: number): void {
    this.mushafSurahNumber = surahNumber;
    this.mushafPage = 1;
    this.mushafError = '';
    this.mushafOpen = true;
    // Wait for *ngIf canvas to mount, then render.
    setTimeout(() => void this.renderMushafPage(), 0);
  }

  closeMushaf(): void {
    this.mushafOpen = false;
    this.mushafRenderToken += 1;
    // Closing while listening pauses auto-follow until the next play.
    if (this.isAudioPlaying || this.playingSurah != null) {
      this.mushafFollowSuspended = true;
    }
  }

  async shiftMushafPage(delta: number): Promise<void> {
    const step = delta === 0 ? 0 : delta > 0 ? this.mushafPageStep : -this.mushafPageStep;
    const next = Math.max(
      this.mushafPageMin,
      Math.min(this.mushafPageMax, this.mushafPage + step)
    );
    if (next === this.mushafPage) {
      return;
    }
    this.mushafPage = next;
    await this.renderMushafPage();
  }

  private async ensurePdf(): Promise<PDFDocumentProxy> {
    const surah = this.mushafSurahNumber || 1;
    const url = mushafPdfUrlForSurah(surah);

    if (this.pdfDoc && this.loadedPdfUrl === url) {
      return this.pdfDoc;
    }

    if (this.pdfDoc) {
      try {
        await this.pdfDoc.destroy();
      } catch {
        /* ignore */
      }
      this.pdfDoc = null;
      this.pdfLoadPromise = null;
    }

    if (!this.pdfLoadPromise) {
      this.mushafLoading = true;
      this.mushafError = '';
      this.loadedPdfUrl = url;
      this.pdfLoadPromise = getDocument({
        url,
        // Range requests avoid pulling the whole file before the first page.
        disableAutoFetch: true,
        disableStream: false
      })
        .promise.then((doc) => {
          this.pdfDoc = doc;
          return doc;
        })
        .catch((err: unknown) => {
          this.pdfLoadPromise = null;
          this.loadedPdfUrl = null;
          this.mushafError =
            'Could not load the mushaf PDF. Check the Blob URL / local file.';
          throw err;
        })
        .finally(() => {
          this.mushafLoading = false;
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
    try {
      const doc = await this.ensurePdf();
      if (token !== this.mushafRenderToken || !this.mushafOpen) {
        return;
      }
      const rightCanvas = this.mushafCanvasRef?.nativeElement;
      const leftCanvas = this.mushafCanvasLeftRef?.nativeElement;
      const wrap = this.mushafPageWrapRef?.nativeElement;
      if (!rightCanvas || !wrap) {
        return;
      }

      const surah = this.mushafSurahNumber || 1;
      const rightPageNum = documentPageForSurah(surah, this.mushafPage);
      const showLeft = this.showMushafLeftPage && !!leftCanvas;
      const gap = showLeft ? 12 : 0;
      const pageSlots = showLeft ? 2 : 1;
      const maxWidth = Math.max(
        160,
        (wrap.clientWidth - 16 - gap) / pageSlots
      );
      const maxHeight = Math.max(320, wrap.clientHeight - 16);

      await this.paintPdfPage(doc, rightPageNum, rightCanvas, maxWidth, maxHeight);
      if (token !== this.mushafRenderToken || !this.mushafOpen) {
        return;
      }

      if (showLeft && leftCanvas) {
        const leftPageNum = documentPageForSurah(surah, this.mushafPage + 1);
        await this.paintPdfPage(doc, leftPageNum, leftCanvas, maxWidth, maxHeight);
      }
    } catch {
      if (token === this.mushafRenderToken) {
        this.mushafError =
          this.mushafError || 'Could not render this mushaf page.';
      }
    } finally {
      if (token === this.mushafRenderToken) {
        this.mushafLoading = false;
      }
    }
  }

  private async paintPdfPage(
    doc: PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    maxWidth: number,
    maxHeight: number
  ): Promise<void> {
    const page = await doc.getPage(pageNumber);
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
    const transform =
      outputScale !== 1
        ? ([outputScale, 0, 0, outputScale, 0, 0] as const)
        : undefined;
    await page.render({
      canvasContext: ctx,
      viewport,
      transform: transform ? [...transform] : undefined
    }).promise;
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
    this.mushafPage = 1;
    this.mushafError = '';
    this.mushafOpen = true;
    this.lastFollowSyncedPage = 1;
    setTimeout(() => void this.renderMushafPage(), 0);
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
