import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { loginErrorMessage, registerErrorMessage } from './auth-errors';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  const run = (user: unknown) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { whenReady: () => Promise.resolve(), user: () => user },
        },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  };

  it('lets a signed-in user through', async () => {
    expect(await run({ uid: 'u1' })).toBe(true);
  });

  it('sends everyone else to the login page', async () => {
    const result = await run(null);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});

describe('sign-in error messages', () => {
  it('explains login failures', () => {
    expect(loginErrorMessage('auth/user-not-found')).toBe('No account found with this email');
    expect(loginErrorMessage('auth/wrong-password')).toBe('Incorrect password');
    expect(loginErrorMessage('auth/invalid-email')).toBe('Invalid email address');
    expect(loginErrorMessage('auth/too-many-requests')).toBe(
      'Too many attempts. Please wait and try again.',
    );
    expect(loginErrorMessage('auth/something-new')).toBe('Login failed. Please try again.');
    expect(loginErrorMessage(undefined)).toBe('Login failed. Please try again.');
  });

  it('explains registration failures', () => {
    expect(registerErrorMessage('auth/email-already-in-use')).toBe(
      'An account with this email already exists',
    );
    expect(registerErrorMessage('auth/weak-password')).toBe(
      'Password is too weak (min 6 characters)',
    );
    expect(registerErrorMessage('auth/invalid-email')).toBe('Invalid email address');
    expect(registerErrorMessage('other')).toBe('Registration failed. Please try again.');
  });
});
