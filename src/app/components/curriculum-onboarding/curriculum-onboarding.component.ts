import {
  Component,
  DestroyRef,
  EventEmitter,
  Output,
  inject,
  signal
} from '@angular/core';
import { SURAHS, surahLabel } from '../../data/surahs';
import {
  buildMemorizedPortions,
  buildWeeklyManzil,
  normalizeSurahList
} from '../../data/curriculum';
import { CORE_MANZIL_SURAH_NUMBERS } from '../../data/revision-plan';
import { ProgressService } from '../../services/progress.service';

const PREPARE_STEPS = [
  'Sorting your memorized surahs…',
  'Balancing revision days…',
  'Building your weekly plan…',
  'Opening your roadmap…'
] as const;

@Component({
  selector: 'app-curriculum-onboarding',
  templateUrl: './curriculum-onboarding.component.html',
  styleUrl: './curriculum-onboarding.component.css'
})
export class CurriculumOnboardingComponent {
  @Output() completed = new EventEmitter<void>();

  private readonly progress = inject(ProgressService);
  private readonly destroyRef = inject(DestroyRef);

  readonly surahs = SURAHS;
  readonly surahLabel = surahLabel;
  readonly juz30Start = 78;

  selected = signal<Set<number>>(new Set());
  search = signal('');
  saving = signal(false);
  preparing = signal(false);
  prepareMessage = signal<string>(PREPARE_STEPS[0]);
  error = signal('');

  /** True when the user already has a plan and is editing it (vs first-run). */
  readonly isEditing: boolean;

  private stepTimers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    const snap = this.progress.snapshot;
    this.isEditing = (snap.memorizedSurahNumbers?.length ?? 0) > 0;
    const existing = snap.memorizedSurahNumbers?.length
      ? snap.memorizedSurahNumbers
      : snap.onboardingComplete === false
        ? []
        : CORE_MANZIL_SURAH_NUMBERS;
    if (existing.length) {
      this.selected.set(new Set(existing));
    }

    this.destroyRef.onDestroy(() => this.clearPrepareTimers());
  }

  /** Close the picker without changes (only offered when already set up). */
  cancel(): void {
    if (this.preparing()) {
      return;
    }
    this.progress.cancelCurriculumEdit();
    this.completed.emit();
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
    if (this.preparing()) {
      return;
    }
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
    if (this.preparing()) {
      return;
    }
    const next = new Set(this.selected());
    for (let n = this.juz30Start; n <= 114; n++) {
      next.add(n);
    }
    this.selected.set(next);
  }

  selectRange(from: number, to: number): void {
    if (this.preparing()) {
      return;
    }
    const next = new Set(this.selected());
    for (let n = from; n <= to; n++) {
      next.add(n);
    }
    this.selected.set(next);
  }

  clearAll(): void {
    if (this.preparing()) {
      return;
    }
    this.selected.set(new Set());
  }

  submit(): void {
    if (this.preparing()) {
      return;
    }
    const list = normalizeSurahList([...this.selected()]);
    if (!list.length) {
      this.error.set('Select at least one memorized surah to continue.');
      return;
    }

    this.saving.set(true);
    this.preparing.set(true);
    this.prepareMessage.set(PREPARE_STEPS[0]);
    this.error.set('');

    // Run the real work up front so the dashboard is ready when the overlay finishes.
    const weekly = buildWeeklyManzil(list);
    this.progress.saveCurriculum(list, weekly);
    void buildMemorizedPortions(list);

    this.clearPrepareTimers();
    PREPARE_STEPS.forEach((msg, i) => {
      if (i === 0) {
        return;
      }
      this.stepTimers.push(
        setTimeout(() => this.prepareMessage.set(msg), i * 900)
      );
    });

    this.stepTimers.push(
      setTimeout(() => {
        this.saving.set(false);
        this.preparing.set(false);
        this.completed.emit();
      }, PREPARE_STEPS.length * 900)
    );
  }

  private clearPrepareTimers(): void {
    for (const t of this.stepTimers) {
      clearTimeout(t);
    }
    this.stepTimers = [];
  }
}
