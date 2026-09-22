import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { DEFAULT_SURAH_NUMBER } from '../data/revision-plan';
import { formatSurahName, getSurah, SURAHS } from '../data/surahs';
import {
  DailyCompletion,
  MemorizationProgress,
  emptyDaily,
  todayKey
} from '../models/progress.model';

const STORAGE_KEY = 'quran-revision-progress-v3';
const LEGACY_KEYS = ['quran-revision-progress-v2', 'quran-revision-progress-v1'];
const PROGRESS_URL = `${environment.apiBaseUrl.replace(/\/$/, '')}/api/progress`;

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly http = inject(HttpClient);
  private readonly progressSubject = new BehaviorSubject<MemorizationProgress>(
    this.createDefault()
  );
  private syncEnabled = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  readonly progress$ = this.progressSubject.asObservable();

  get snapshot(): MemorizationProgress {
    return this.progressSubject.value;
  }

  /**
   * Peek at any leftover browser progress (for founding-user signup claim).
   * Does not change the in-memory subject.
   */
  peekLocalProgress(): MemorizationProgress | null {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (const key of LEGACY_KEYS) {
          raw = localStorage.getItem(key);
          if (raw) {
            break;
          }
        }
      }
      if (!raw) {
        return null;
      }
      return this.normalize(JSON.parse(raw) as Partial<MemorizationProgress>);
    } catch {
      return null;
    }
  }

  /** Load from API after login; falls back to local cache if the request fails. */
  loadFromServer(): Observable<MemorizationProgress> {
    this.syncEnabled = true;
    return this.http.get<{ progress: MemorizationProgress }>(PROGRESS_URL).pipe(
      map((res) => this.normalize(res.progress || {})),
      tap((progress) => {
        this.persistLocal(progress);
        this.progressSubject.next(progress);
      }),
      catchError(() => {
        const local = this.peekLocalProgress() || this.createDefault();
        this.progressSubject.next(local);
        return of(local);
      })
    );
  }

  /** Stop syncing and clear in-memory state on logout. */
  resetForGuest(): void {
    this.syncEnabled = false;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    this.progressSubject.next(this.createDefault());
  }

  setCurrentSurah(surahNumber: number): void {
    const surah = getSurah(surahNumber) || getSurah(DEFAULT_SURAH_NUMBER)!;
    const ayah = Math.min(this.snapshot.currentAyah, surah.ayahCount);
    this.update({
      currentSurahNumber: surah.number,
      currentAyah: ayah,
      currentPhase: formatSurahName(surah.number),
      currentLine: ayah
    });
  }

  setCurrentAyah(ayah: number): void {
    const surah = getSurah(this.snapshot.currentSurahNumber);
    const max = surah?.ayahCount ?? 0;
    const safe = Number.isFinite(ayah)
      ? Math.max(0, Math.min(max, Math.floor(ayah)))
      : 0;
    this.update({ currentAyah: safe, currentLine: safe });
  }

  advanceToNextSurah(): boolean {
    const current = this.snapshot.currentSurahNumber;
    const next = SURAHS.find((s) => s.number === current + 1);
    if (!next) {
      const surah = getSurah(current);
      this.update({
        currentAyah: surah?.ayahCount ?? 0,
        currentLine: surah?.ayahCount ?? 0
      });
      return false;
    }
    this.update({
      currentSurahNumber: next.number,
      currentAyah: 0,
      currentLine: 0,
      currentPhase: formatSurahName(next.number)
    });
    return true;
  }

  toggleTask(task: keyof Omit<DailyCompletion, 'date'>): void {
    const daily = this.ensureTodayDaily();
    this.update({ daily: { ...daily, [task]: !daily[task] } });
  }

  markAllDone(): void {
    const daily = this.ensureTodayDaily();
    this.update({ daily: { ...daily, sabaqSabqi: true, manzil: true } });
  }

  resetToday(): void {
    this.update({ daily: emptyDaily() });
  }

  toggleMemorizedReview(portionId: string): void {
    const reviews = { ...this.snapshot.memorizedReviews };
    if (reviews[portionId] === todayKey()) {
      delete reviews[portionId];
    } else {
      reviews[portionId] = todayKey();
    }
    this.update({ memorizedReviews: reviews });
  }

  refreshForNewDay(): void {
    if (this.snapshot.daily.date === todayKey()) {
      return;
    }
    this.update({ daily: emptyDaily() });
  }

  exportJson(): string {
    return JSON.stringify(this.snapshot, null, 2);
  }

  importJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as Partial<MemorizationProgress>;
      if (!parsed) {
        return false;
      }
      const next = this.normalize(parsed);
      this.persistLocal(next);
      this.progressSubject.next(next);
      this.scheduleServerSave(next);
      return true;
    } catch {
      return false;
    }
  }

  /** Mark onboarding incomplete so the root picker shows again. */
  requestCurriculumEdit(): void {
    this.update({ onboardingComplete: false });
  }

  /** Save memorized surahs + generated weekly plan after onboarding / edits. */
  saveCurriculum(surahNumbers: number[], weeklyManzil: MemorizationProgress['weeklyManzil']): void {
    this.update({
      memorizedSurahNumbers: surahNumbers,
      weeklyManzil: weeklyManzil ?? [],
      onboardingComplete: true
    });
  }

  private ensureTodayDaily(): DailyCompletion {
    const current = this.snapshot;
    if (current.daily.date === todayKey()) {
      return current.daily;
    }
    const daily = emptyDaily();
    this.update({ daily });
    return daily;
  }

  private update(partial: Partial<MemorizationProgress>): void {
    const next: MemorizationProgress = {
      ...this.snapshot,
      ...partial,
      updatedAt: new Date().toISOString()
    };
    this.persistLocal(next);
    this.progressSubject.next(next);
    this.scheduleServerSave(next);
  }

  private scheduleServerSave(progress: MemorizationProgress): void {
    if (!this.syncEnabled) {
      return;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.http.put(PROGRESS_URL, progress).subscribe({
        error: () => {
          /* keep local cache; retry on next edit */
        }
      });
    }, 400);
  }

  private normalize(value: Partial<MemorizationProgress>): MemorizationProgress {
    const today = todayKey();
    const rawDaily = value.daily as
      | (Partial<DailyCompletion> & { sabaq?: boolean; sabqi?: boolean })
      | undefined;
    const daily =
      rawDaily?.date === today
        ? {
            date: today,
            sabaqSabqi:
              rawDaily.sabaqSabqi ?? (!!rawDaily.sabaq && !!rawDaily.sabqi),
            manzil: !!rawDaily.manzil
          }
        : emptyDaily();

    let surahNumber =
      typeof value.currentSurahNumber === 'number'
        ? value.currentSurahNumber
        : DEFAULT_SURAH_NUMBER;

    if (!getSurah(surahNumber) && typeof value.currentPhase === 'string') {
      const match = value.currentPhase.match(/muddaththir/i)
        ? 74
        : SURAHS.find((s) =>
            value.currentPhase!.toLowerCase().includes(s.name.toLowerCase())
          )?.number;
      surahNumber = match || DEFAULT_SURAH_NUMBER;
    }

    const surah = getSurah(surahNumber) || getSurah(DEFAULT_SURAH_NUMBER)!;
    const rawAyah =
      typeof value.currentAyah === 'number'
        ? value.currentAyah
        : typeof value.currentLine === 'number'
          ? value.currentLine
          : 0;
    const ayah = Math.max(0, Math.min(surah.ayahCount, Math.floor(rawAyah)));

    return {
      currentSurahNumber: surah.number,
      currentAyah: ayah,
      currentPhase: formatSurahName(surah.number),
      currentLine: ayah,
      daily,
      memorizedReviews:
        value.memorizedReviews &&
        typeof value.memorizedReviews === 'object' &&
        !Array.isArray(value.memorizedReviews)
          ? { ...value.memorizedReviews }
          : {},
      updatedAt: value.updatedAt || new Date().toISOString(),
      onboardingComplete:
        typeof value.onboardingComplete === 'boolean'
          ? value.onboardingComplete
          : undefined,
      memorizedSurahNumbers: Array.isArray(value.memorizedSurahNumbers)
        ? [
            ...new Set(
              value.memorizedSurahNumbers
                .map((n) => Math.floor(Number(n)))
                .filter((n) => n >= 1 && n <= 114)
            )
          ].sort((a, b) => a - b)
        : undefined,
      weeklyManzil: Array.isArray(value.weeklyManzil)
        ? (value.weeklyManzil as MemorizationProgress['weeklyManzil'])
        : undefined
    };
  }

  private createDefault(): MemorizationProgress {
    return {
      currentSurahNumber: DEFAULT_SURAH_NUMBER,
      currentAyah: 0,
      currentPhase: formatSurahName(DEFAULT_SURAH_NUMBER),
      currentLine: 0,
      daily: emptyDaily(),
      memorizedReviews: {},
      updatedAt: new Date().toISOString(),
      onboardingComplete: false,
      memorizedSurahNumbers: [],
      weeklyManzil: []
    };
  }

  private persistLocal(value: MemorizationProgress): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
}
