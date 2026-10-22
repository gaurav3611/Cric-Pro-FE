import { Injectable, computed, signal } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { environment } from '../../environments/environment';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/** Where the demo user is kept. The original site used the same key. */
const DEMO_USER_KEY = 'sswingg_demo_user';
const PLACEHOLDER_KEY = 'YOUR_API_KEY';

function toAppUser(user: User): AppUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

function readDemoUser(): AppUser | null {
  try {
    const stored = JSON.parse(localStorage.getItem(DEMO_USER_KEY) || 'null');
    return stored
      ? {
          uid: stored.uid ?? 'demo',
          email: stored.email ?? null,
          displayName: stored.displayName ?? null,
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Who is signed in.
 *
 * With a real Firebase config this is Firebase Authentication. With the placeholder key the
 * app runs in demo mode: any email signs in, and the user is kept in the browser only.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth: Auth | null = null;
  private readonly demo: boolean;
  private readonly ready: Promise<void>;
  private readonly currentUser = signal<AppUser | null>(null);

  readonly user = this.currentUser.asReadonly();

  /** The name the dashboard greets the user with. */
  readonly displayName = computed(() => {
    const user = this.currentUser();
    if (!user) return 'Player';
    if (this.demo) return user.displayName || user.email || 'Player';
    return user.displayName || (user.email ? user.email.split('@')[0] : 'Player');
  });

  constructor() {
    let demo = environment.firebase.apiKey === PLACEHOLDER_KEY;
    let ready: Promise<void> = Promise.resolve();

    if (demo) {
      console.warn('[Firebase] Config not set. Running in demo mode.');
    } else {
      try {
        const auth = getAuth(initializeApp(environment.firebase));
        this.auth = auth;
        // The first event tells whether a user from an earlier visit is still signed in.
        ready = new Promise<void>((resolve) =>
          onAuthStateChanged(auth, (user) => {
            this.currentUser.set(user ? toAppUser(user) : null);
            resolve();
          }),
        );
      } catch (error) {
        console.error('[Firebase] Init error:', error);
        demo = true;
      }
    }

    this.demo = demo;
    if (demo) this.currentUser.set(readDemoUser());
    this.ready = ready;
  }

  get demoMode(): boolean {
    return this.demo;
  }

  /**
   * Resolves once it is known whether somebody is signed in.
   *
   * In demo mode the user lives in the browser's storage, where another tab may have put it or
   * removed it since this tab started. So storage is read again each time, as the original
   * site did on every page load.
   */
  whenReady(): Promise<void> {
    if (this.demo) this.currentUser.set(readDemoUser());
    return this.ready;
  }

  async login(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(this.requireAuth(), email, password);
    this.currentUser.set(toAppUser(credential.user));
  }

  async register(name: string, email: string, password: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.requireAuth(), email, password);
    await updateProfile(credential.user, { displayName: name });
    this.currentUser.set({ ...toAppUser(credential.user), displayName: name });
  }

  async googleSignIn(): Promise<void> {
    const result = await signInWithPopup(this.requireAuth(), new GoogleAuthProvider());
    this.currentUser.set(toAppUser(result.user));
  }

  /** Demo mode only: signs in with whatever was typed. */
  demoLogin(email: string, displayName: string, team?: string): void {
    const stored: Record<string, string> = { email, displayName, uid: 'demo-' + Date.now() };
    if (team !== undefined) stored['team'] = team;
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(stored));
    this.currentUser.set({ uid: stored['uid'], email, displayName });
  }

  async logout(): Promise<void> {
    try {
      if (!this.demo && this.auth) await signOut(this.auth);
    } finally {
      localStorage.removeItem(DEMO_USER_KEY);
      this.currentUser.set(null);
    }
  }

  /** The token sent to the API. Demo mode sends the fixed text the original site sent. */
  async token(): Promise<string | null> {
    if (this.demo) return 'demo-token';
    const user = this.auth?.currentUser;
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch (error) {
      console.error('[Auth] Token error:', error);
      return null;
    }
  }

  private requireAuth(): Auth {
    if (!this.auth) throw new Error('Firebase is not configured');
    return this.auth;
  }
}
