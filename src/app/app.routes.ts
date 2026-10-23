import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'SSwinGG | Cricket Bat Swing Analyzer',
    loadComponent: () => import('./pages/login/login-page').then((m) => m.LoginPage),
  },
  { path: 'dashboard', pathMatch: 'full', redirectTo: 'dashboard/home' },
  {
    // :view is "home" or "live". Both are the same page component, so switching between them
    // keeps the running session, the charts and the 3D bat.
    path: 'dashboard/:view',
    title: 'SSwinGG | Cricket Bat Swing Analyzer Dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  { path: '**', redirectTo: 'login' },
];
