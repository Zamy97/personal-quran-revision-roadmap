import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  DAILY_BLUEPRINT,
  DailyBlueprintItem,
  ManzilDay,
  WEEKLY_MANZIL
} from '../../data/revision-plan';
import { MemorizationProgress } from '../../models/progress.model';
import { ProgressService } from '../../services/progress.service';

@Component({
  selector: 'app-roadmap',
  templateUrl: './roadmap.component.html',
  styleUrl: './roadmap.component.css'
})
export class RoadmapComponent implements OnInit, OnDestroy {
  readonly blueprint = DAILY_BLUEPRINT;
  readonly manzilLoop = WEEKLY_MANZIL;

  progress: MemorizationProgress;
  todayLabel = '';
  todayWeekday = '';
  todayManzil!: ManzilDay;
  phaseDraft = '';
  lineDraft = 0;
  statusMessage = '';

  private sub?: Subscription;
  private statusTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly progressService: ProgressService) {
    this.progress = this.progressService.snapshot;
    this.phaseDraft = this.progress.currentPhase;
    this.lineDraft = this.progress.currentLine;
  }

  ngOnInit(): void {
    this.refreshClock();
    this.sub = this.progressService.progress$.subscribe((progress) => {
      this.progress = progress;
      this.phaseDraft = progress.currentPhase;
      this.lineDraft = progress.currentLine;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }
  }

  taskCopy(item: DailyBlueprintItem): string {
    const phase = this.progress?.currentPhase || 'your current surah';
    const line = this.progress?.currentLine || 0;

    switch (item.id) {
      case 'sabaq':
        return `Memorize 2–3 new lines of ${phase}. Connect them firmly with the previous days' lines.`;
      case 'sabqi':
        return line > 0
          ? `Recite ${phase} from verse 1 to line/ayah ${line}, ensuring smooth transitions within the current surah.`
          : `Recite ${phase} from verse 1 to today's lines, ensuring smooth transitions within the current surah.`;
      case 'manzil':
        return `Protect your older memorization by running today's weekly loop: ${this.todayManzil.focusTitle}.`;
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

  savePhase(): void {
    this.progressService.setCurrentPhase(this.phaseDraft);
    this.flash('Current phase updated.');
  }

  saveLine(): void {
    this.progressService.setCurrentLine(Number(this.lineDraft));
    this.flash('Progress line updated.');
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
    return Number(d.sabaq) + Number(d.sabqi) + Number(d.manzil);
  }

  private refreshClock(): void {
    const now = new Date();
    this.todayLabel = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    this.todayWeekday = now.toLocaleDateString(undefined, { weekday: 'long' });
    const dayIndex = now.getDay();
    this.todayManzil =
      this.manzilLoop.find((d) => d.dayIndex === dayIndex) || this.manzilLoop[6];
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
