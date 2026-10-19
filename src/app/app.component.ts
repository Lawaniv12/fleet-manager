import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { BottomNavComponent } from './shared/components/bottom-nav.component';
import { HeaderComponent } from './shared/components/header.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BottomNavComponent, HeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authPage = signal(false);

  constructor() {
    this.updateAuthPage();
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.updateAuthPage());
  }

  private updateAuthPage(): void {
    this.authPage.set(this.router.url.startsWith('/login') || this.router.url.startsWith('/register'));
  }

  protected readonly navLinks = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/tricycles', label: 'Tricycles' },
    { path: '/riders', label: 'Riders' },
    { path: '/ledger', label: 'Ledger' },
    { path: '/reports', label: 'Reports' },
  ];
}
