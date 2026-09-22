import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ProgressService } from '../../services/progress.service';

@Component({
  selector: 'app-auth-gate',
  templateUrl: './auth-gate.component.html',
  styleUrl: './auth-gate.component.css'
})
export class AuthGateComponent {
  auth = inject(AuthService);
  private readonly progress = inject(ProgressService);

  mode = signal<'login' | 'signup'>('login');
  email = signal('');
  password = signal('');
  displayName = signal('');
  inviteCode = signal('');

  /** Founding signup can claim existing browser progress. */
  readonly hasLocalProgress = !!this.progress.peekLocalProgress();

  switchMode(mode: 'login' | 'signup'): void {
    this.mode.set(mode);
    this.auth.error.set(null);
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.auth.submitting()) {
      return;
    }
    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      return;
    }

    if (this.mode() === 'signup') {
      const name = this.displayName().trim();
      const invite = this.inviteCode().trim();
      if (!name || password.length < 6) {
        this.auth.error.set(
          password.length < 6
            ? 'Password must be at least 6 characters'
            : 'Enter your name'
        );
        return;
      }
      if (this.auth.signupInviteRequired() && !invite) {
        this.auth.error.set('Enter the invite code you were given');
        return;
      }
      const claim = this.progress.peekLocalProgress();
      this.auth.signup(email, password, name, invite, claim).subscribe();
      return;
    }

    this.auth.login(email, password).subscribe();
  }
}
