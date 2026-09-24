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
  /** Surahs already saved as memorized — kept, but hidden from the add grid. */
  readonly alreadyMemorized: Set<number>;

  private stepTimers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    const snap = this.progress.snapshot;
    this.isEditing = (snap.memorizedSurahNumbers?.length ?? 0) > 0;
    this.alreadyMemorized = new Set(
      this.isEditing ? snap.memorizedSurahNumbers : []
    );

    if (!this.isEditing) {
      // First run: pre-select a sensible starting set (unless explicitly blank).
      const existing =
        snap.onboardingComplete === false ? [] : CORE_MANZIL_SURAH_NUMBERS;
      if (existing.length) {
        this.selected.set(new Set(existing));
      }
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
    // When editing, hide surahs already saved as memorized — this list is only
    // for adding new ones.
    let list = this.alreadyMemorized.size
      ? this.surahs.filter((s) => !this.alreadyMemorized.has(s.number))
      : this.surahs;
    const q = this.search().trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter(
      (s) =>
        String(s.number).includes(q) ||
        s.name.toLowerCase().includes(q) ||
        surahLabel(s).toLowerCase().includes(q)
    );
  }

  get selectedCount(): number {
    return this.selected().size;
  }

  /** Surahs newly picked this session (excludes the already-memorized set). */
  get newCount(): number {
    return this.selected().size;
  }

  get alreadyCount(): number {
    return this.alreadyMemorized.size;
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
      if (!this.alreadyMemorized.has(n)) {
        next.add(n);
      }
    }
    this.selected.set(next);
  }

  selectRange(from: number, to: number): void {
    if (this.preparing()) {
      return;
    }
    const next = new Set(this.selected());
    for (let n = from; n <= to; n++) {
      if (!this.alreadyMemorized.has(n)) {
        next.add(n);
      }
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
    // Keep everything already memorized and add the new picks on top.
    const list = normalizeSurahList([
      ...this.alreadyMemorized,
      ...this.selected()
    ]);
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
