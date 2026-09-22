import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { SURAHS, surahLabel } from '../../data/surahs';
import {
  buildMemorizedPortions,
  buildWeeklyManzil,
  normalizeSurahList
} from '../../data/curriculum';
import { CORE_MANZIL_SURAH_NUMBERS } from '../../data/revision-plan';
import { ProgressService } from '../../services/progress.service';

@Component({
  selector: 'app-curriculum-onboarding',
  templateUrl: './curriculum-onboarding.component.html',
  styleUrl: './curriculum-onboarding.component.css'
})
export class CurriculumOnboardingComponent {
  @Output() completed = new EventEmitter<void>();

  private readonly progress = inject(ProgressService);

  readonly surahs = SURAHS;
  readonly surahLabel = surahLabel;
  readonly juz30Start = 78;

  selected = signal<Set<number>>(new Set());
  search = signal('');
  saving = signal(false);
  error = signal('');

  constructor() {
    const snap = this.progress.snapshot;
    const existing = snap.memorizedSurahNumbers?.length
      ? snap.memorizedSurahNumbers
      : snap.onboardingComplete === false
        ? []
        : CORE_MANZIL_SURAH_NUMBERS;
    if (existing.length) {
      this.selected.set(new Set(existing));
    }
  }

  get filteredSurahs() {
    const q = this.search().trim().toLowerCase();
    if (!q) {
      return this.surahs;
    }
    return this.surahs.filter(
      (s) =>
        String(s.number).includes(q) ||
        s.name.toLowerCase().includes(q) ||
        surahLabel(s).toLowerCase().includes(q)
    );
  }

  get selectedCount(): number {
    return this.selected().size;
  }

  isSelected(n: number): boolean {
    return this.selected().has(n);
  }

  toggle(n: number): void {
    const next = new Set(this.selected());
    if (next.has(n)) {
      next.delete(n);
    } else {
      next.add(n);
    }
    this.selected.set(next);
    this.error.set('');
  }

  selectJuz30(): void {
    const next = new Set(this.selected());
    for (let n = this.juz30Start; n <= 114; n++) {
      next.add(n);
    }
    this.selected.set(next);
  }

  selectRange(from: number, to: number): void {
    const next = new Set(this.selected());
    for (let n = from; n <= to; n++) {
      next.add(n);
    }
    this.selected.set(next);
  }

  clearAll(): void {
    this.selected.set(new Set());
  }

  submit(): void {
    const list = normalizeSurahList([...this.selected()]);
    if (!list.length) {
      this.error.set('Select at least one memorized surah to continue.');
      return;
    }
    this.saving.set(true);
    const weekly = buildWeeklyManzil(list);
    this.progress.saveCurriculum(list, weekly);
    // Touch memorized portions build so volume is ready for the memorized tab.
    void buildMemorizedPortions(list);
    this.saving.set(false);
    this.completed.emit();
  }
}
