import { Component, OnDestroy, effect, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from './services/auth.service';
import { ProgressService } from './services/progress.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly progress = inject(ProgressService);
  private loadSub?: Subscription;

  constructor() {
    this.auth.start();
    effect(() => {
      const unlocked = this.auth.unlocked();
      this.loadSub?.unsubscribe();
      if (unlocked) {
        this.loadSub = this.progress.loadFromServer().subscribe();
      } else {
        this.progress.resetForGuest();
      }
    });
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
  }
}
