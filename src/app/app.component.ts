import { Component, OnDestroy, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  MemorizationProgress,
  needsCurriculumOnboarding
} from './models/progress.model';
import { AuthService } from './services/auth.service';
import { ProgressService } from './services/progress.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly progressService = inject(ProgressService);
  private loadSub?: Subscription;
  private progressSub?: Subscription;

  progress = signal<MemorizationProgress | null>(null);
  showOnboarding = signal(false);

  constructor() {
    this.auth.start();
    effect(() => {
      const unlocked = this.auth.unlocked();
      this.loadSub?.unsubscribe();
      this.progressSub?.unsubscribe();
      if (unlocked) {
        this.loadSub = this.progressService.loadFromServer().subscribe((p) => {
          this.progress.set(p);
          this.showOnboarding.set(needsCurriculumOnboarding(p));
        });
        this.progressSub = this.progressService.progress$.subscribe((p) => {
          this.progress.set(p);
          this.showOnboarding.set(needsCurriculumOnboarding(p));
        });
      } else {
        this.progressService.resetForGuest();
        this.progress.set(null);
        this.showOnboarding.set(false);
      }
    });
  }

  onOnboardingDone(): void {
    this.showOnboarding.set(false);
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.progressSub?.unsubscribe();
  }
}
