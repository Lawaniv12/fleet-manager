import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { publicOnlyGuard } from './core/guards/public-only.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent),
    data: { authPage: true, mode: 'login' }
  },
  {
    path: 'register',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent),
    data: { authPage: true, mode: 'register' }
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'tricycles',
    canActivate: [authGuard],
    loadComponent: () => import('./features/tricycles/tricycle-list.component').then(m => m.TricycleListComponent)
  },
  {
    path: 'riders',
    canActivate: [authGuard],
    loadComponent: () => import('./features/riders/rider-list.component').then(m => m.RiderListComponent)
  },
  {
    path: 'ledger',
    canActivate: [authGuard],
    loadComponent: () => import('./features/ledger/ledger-timeline.component').then(m => m.LedgerTimelineComponent)
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent)
  }
];
