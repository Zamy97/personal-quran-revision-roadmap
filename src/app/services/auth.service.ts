import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, EMPTY, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { MemorizationProgress } from '../models/progress.model';

const AUTH_URL = `${environment.apiBaseUrl.replace(/\/$/, '')}/api/auth`;
const TOKEN_KEY = 'quran-auth-token';
const USER_KEY = 'quran-auth-user';

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
}

interface AuthResponse {
  token: string;
  tokenType: string;
  expiresInMs: number;
  user: AuthUser;
}

/** Email/password JWT auth. Stays signed in until the user signs out. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  ready = signal(false);
  unlocked = signal(false);
  submitting = signal(false);
  error = signal<string | null>(null);
  token = signal('');
  user = signal<AuthUser | null>(null);
  signupInviteRequired = signal(true);

  private started = false;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.http.get<{ signupInviteRequired: boolean }>(`${AUTH_URL}/config`).subscribe({
      next: (cfg) => this.signupInviteRequired.set(!!cfg.signupInviteRequired),
      error: () => this.signupInviteRequired.set(true)
    });

    const storedToken = localStorage.getItem(TOKEN_KEY) ?? '';
    const storedUser = this.readStoredUser();
    if (!storedToken || !storedUser) {
      this.clearStoredSession();
      this.ready.set(true);
      return;
    }

    this.token.set(storedToken);
    this.user.set(storedUser);
    this.http.get<AuthUser>(`${AUTH_URL}/me`).subscribe({
      next: (me) => {
        this.user.set(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
        this.unlocked.set(true);
        this.ready.set(true);
      },
      error: () => {
        this.logout(false);
        this.ready.set(true);
      }
    });
  }

  signup(
    email: string,
    password: string,
    displayName: string,
    inviteCode = '',
    progress?: MemorizationProgress | null
  ): Observable<AuthResponse> {
    this.submitting.set(true);
    this.error.set(null);
    const body: Record<string, unknown> = {
      email,
      password,
      displayName,
      inviteCode
    };
    if (progress) {
      body['progress'] = progress;
    }
    return this.http.post<AuthResponse>(`${AUTH_URL}/signup`, body).pipe(
      tap((res) => this.acceptSession(res)),
      catchError((err) => {
        this.handleAuthError(err, 'Could not create your account. Try again.');
        return EMPTY;
      })
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    this.submitting.set(true);
    this.error.set(null);
    return this.http.post<AuthResponse>(`${AUTH_URL}/login`, { email, password }).pipe(
      tap((res) => this.acceptSession(res)),
      catchError((err) => {
        this.handleAuthError(err, 'Could not reach the server. Try again.');
        return EMPTY;
      })
    );
  }

  logout(showExpiredMessage = false): void {
    const wasUnlocked = this.unlocked();
    this.unlocked.set(false);
    this.token.set('');
    this.user.set(null);
    this.submitting.set(false);
    this.clearStoredSession();
    if (showExpiredMessage && wasUnlocked) {
      this.error.set('Please sign in again.');
    }
  }

  /** Called when the API rejects the stored token. */
  lock(): void {
    this.logout(true);
  }

  private acceptSession(res: AuthResponse): void {
    this.token.set(res.token);
    this.user.set(res.user);
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.unlocked.set(true);
    this.submitting.set(false);
    this.ready.set(true);
    this.error.set(null);
  }

  private handleAuthError(
    err: { status?: number; error?: { message?: string } },
    fallback: string
  ): void {
    this.submitting.set(false);
    this.ready.set(true);
    if (err?.status === 401) {
      this.error.set('Invalid email or password');
    } else if (err?.status === 403) {
      this.error.set(err?.error?.message || 'Invalid or missing invite code');
    } else if (err?.status === 409) {
      this.error.set('An account with that email already exists');
    } else if (err?.error?.message) {
      this.error.set(err.error.message);
    } else {
      this.error.set(fallback);
    }
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  private clearStoredSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('quran-auth-expires-at');
  }
}
