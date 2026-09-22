import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly auth: AuthService) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const token = this.auth.token();
    const isApi = this.isAppApiRequest(req.url);
    const withAuth =
      token && isApi
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

    return next.handle(withAuth).pipe(
      catchError((err: HttpErrorResponse) => {
        if (
          err?.status === 401 &&
          isApi &&
          !req.url.includes('/api/auth/login') &&
          !req.url.includes('/api/auth/signup')
        ) {
          this.auth.lock();
        }
        return throwError(() => err);
      })
    );
  }

  private isAppApiRequest(url: string): boolean {
    const base = environment.apiBaseUrl.replace(/\/$/, '');
    if (base) {
      return url.startsWith(`${base}/api/`) || url === `${base}/api`;
    }
    return url.startsWith('/api/');
  }
}
