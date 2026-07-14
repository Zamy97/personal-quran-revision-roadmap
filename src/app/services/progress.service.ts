import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_PHASE } from '../data/revision-plan';
import {
  DailyCompletion,
  MemorizationProgress,
  emptyDaily,
  todayKey
} from '../models/progress.model';

const STORAGE_KEY = 'quran-revision-progress-v1';

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly progressSubject = new BehaviorSubject<MemorizationProgress>(
    this.load()
  );

  readonly progress$ = this.progressSubject.asObservable();

  get snapshot(): MemorizationProgress {
    return this.progressSubject.value;
  }

  setCurrentPhase(phase: string): void {
    this.update({ currentPhase: phase.trim() || DEFAULT_PHASE });
  }

  setCurrentLine(line: number): void {
    const safe = Number.isFinite(line) ? Math.max(0, Math.floor(line)) : 0;
    this.update({ currentLine: safe });
  }

  toggleTask(task: keyof Omit<DailyCompletion, 'date'>): void {
    const daily = this.ensureTodayDaily();
    this.update({
      daily: {
        ...daily,
        [task]: !daily[task]
      }
    });
  }

  markAllDone(): void {
    const daily = this.ensureTodayDaily();
    this.update({
      daily: { ...daily, sabaq: true, sabqi: true, manzil: true }
    });
  }

  resetToday(): void {
    this.update({ daily: emptyDaily() });
  }

  exportJson(): string {
    return JSON.stringify(this.snapshot, null, 2);
  }

  importJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as MemorizationProgress;
      if (!parsed || typeof parsed.currentPhase !== 'string') {
        return false;
      }
      const next = this.normalize(parsed);
      this.persist(next);
      this.progressSubject.next(next);
      return true;
    } catch {
      return false;
    }
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
    this.persist(next);
    this.progressSubject.next(next);
  }

  private load(): MemorizationProgress {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.createDefault();
      }
      return this.normalize(JSON.parse(raw) as MemorizationProgress);
    } catch {
      return this.createDefault();
    }
  }

  private normalize(value: MemorizationProgress): MemorizationProgress {
    const today = todayKey();
    const daily =
      value.daily?.date === today
        ? {
            date: today,
            sabaq: !!value.daily.sabaq,
            sabqi: !!value.daily.sabqi,
            manzil: !!value.daily.manzil
          }
        : emptyDaily();

    return {
      currentPhase: value.currentPhase || DEFAULT_PHASE,
      currentLine:
        typeof value.currentLine === 'number' && value.currentLine >= 0
          ? Math.floor(value.currentLine)
          : 0,
      daily,
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  }

  private createDefault(): MemorizationProgress {
    return {
      currentPhase: DEFAULT_PHASE,
      currentLine: 0,
      daily: emptyDaily(),
      updatedAt: new Date().toISOString()
    };
  }

  private persist(value: MemorizationProgress): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
}
