import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { loginErrorMessage, registerErrorMessage } from '../../core/auth-errors';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

/**
 * Sign in and create account.
 *
 * The stylesheet is not scoped to this component, because it styles body and :root. Angular
 * removes it when the page is left.
 */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, Icon],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly tab = signal<'login' | 'register'>('login');

  protected loginEmail = '';
  protected loginPassword = '';
  protected readonly loginError = signal('');
  protected readonly loginErrorVisible = signal(false);
  protected readonly loginBusy = signal(false);
  protected readonly showLoginPassword = signal(false);

  protected registerName = '';
  protected registerTeam = '';
  protected registerEmail = '';
  protected registerPassword = '';
  protected registerConfirm = '';
  protected readonly registerError = signal('');
  protected readonly registerErrorVisible = signal(false);
  protected readonly registerBusy = signal(false);
  protected readonly showRegisterPassword = signal(false);

  constructor() {
    // With real sign-in, a signed-in user goes straight to the dashboard. This also covers
    // the moment a login or registration succeeds. Demo mode waits for the form instead.
    effect(() => {
      if (!this.auth.demoMode && this.auth.user()) this.goToDashboard();
    });
  }

  protected selectTab(tab: 'login' | 'register'): void {
    this.tab.set(tab);
    this.loginErrorVisible.set(false);
    this.registerErrorVisible.set(false);
  }

  protected async onLogin(): Promise<void> {
    const email = this.loginEmail.trim();
    const password = this.loginPassword;
    if (!email || !password) {
      this.showLoginError('Please fill in all fields');
      return;
    }

    if (this.auth.demoMode) {
      this.toast.show('Demo mode: opening the dashboard', 'info', true);
      this.auth.demoLogin(email, email.split('@')[0]);
      setTimeout(() => this.goToDashboard(), 1000);
      return;
    }

    this.loginBusy.set(true);
    try {
      await this.auth.login(email, password);
      this.toast.show('Signed in. Opening the dashboard.', 'success', true);
    } catch (error) {
      this.showLoginError(loginErrorMessage((error as { code?: string }).code));
    } finally {
      this.loginBusy.set(false);
    }
  }

  protected async onRegister(): Promise<void> {
    const name = this.registerName.trim();
    const email = this.registerEmail.trim();
    const password = this.registerPassword;
    const team = this.registerTeam.trim();

    if (!name || !email || !password) {
      this.showRegisterError('Please fill in all required fields');
      return;
    }
    if (password.length < 6) {
      this.showRegisterError('Password must be at least 6 characters');
      return;
    }
    if (password !== this.registerConfirm) {
      this.showRegisterError('Passwords do not match');
      return;
    }

    if (this.auth.demoMode) {
      this.toast.show('Demo account created. Opening the dashboard.', 'info', true);
      this.auth.demoLogin(email, name, team);
      setTimeout(() => this.goToDashboard(), 1000);
      return;
    }

    this.registerBusy.set(true);
    try {
      await this.auth.register(name, email, password);
      try {
        await this.api.updateProfile({ display_name: name, team, batting_style: 'right' });
      } catch (error) {
        console.warn('[Profile] Could not save profile:', error);
      }
      this.toast.show('Account created. Opening the dashboard.', 'success', true);
    } catch (error) {
      this.showRegisterError(registerErrorMessage((error as { code?: string }).code));
    } finally {
      this.registerBusy.set(false);
    }
  }

  protected async onGoogle(): Promise<void> {
    if (this.auth.demoMode) {
      this.toast.show('Google sign-in is not available in demo mode', 'info', true);
      return;
    }
    try {
      await this.auth.googleSignIn();
      this.toast.show('Signed in with Google. Opening the dashboard.', 'success', true);
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      if (failure.code !== 'auth/popup-closed-by-user') {
        this.toast.show('Google sign-in failed: ' + failure.message, 'error', true);
      }
    }
  }

  private showLoginError(message: string): void {
    this.loginError.set(message);
    this.loginErrorVisible.set(true);
  }

  private showRegisterError(message: string): void {
    this.registerError.set(message);
    this.registerErrorVisible.set(true);
  }

  private goToDashboard(): void {
    void this.router.navigate(['/dashboard', 'home']);
  }
}
