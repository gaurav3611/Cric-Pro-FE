import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, from, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export interface ProfileStats {
  total_sessions?: number;
  total_swings?: number;
  best_score?: number;
  avg_speed?: number;
  off_side_shots?: number;
  leg_side_shots?: number;
}

export interface ProfileResponse {
  uid?: string;
  email?: string | null;
  display_name?: string | null;
  stats?: ProfileStats;
}

export interface SessionRecord {
  session_id?: string;
  started_at?: string;
  duration_seconds?: number;
  swing_count?: number;
  peak_speed_kmh?: number;
  overall_score?: number;
}

export interface SessionsResponse {
  sessions?: SessionRecord[];
  error?: string;
}

export interface ProfileUpdate {
  display_name: string;
  team: string;
  batting_style: string;
}

/** Adds the sign-in token to every call to /api/. */
export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const auth = inject(AuthService);
  return from(auth.token()).pipe(
    switchMap((token) =>
      next(token ? request.clone({ setHeaders: { Authorization: 'Bearer ' + token } }) : request),
    ),
  );
};

/**
 * The three backend calls the frontend makes. The paths are relative, so the API must be on
 * the same address as the app. `ng serve` forwards /api to localhost:5050, see proxy.conf.json.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getProfile(): Promise<ProfileResponse> {
    return firstValueFrom(this.http.get<ProfileResponse>('/api/profile'));
  }

  getSessions(): Promise<SessionsResponse> {
    return firstValueFrom(this.http.get<SessionsResponse>('/api/sessions'));
  }

  updateProfile(profile: ProfileUpdate): Promise<unknown> {
    return firstValueFrom(this.http.put('/api/profile', profile));
  }
}
