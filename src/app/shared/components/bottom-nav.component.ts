import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss'
})
export class BottomNavComponent {
  protected readonly navLinks = [
    { path: '/dashboard', label: 'Home' },
    { path: '/tricycles', label: 'Kekes' },
    { path: '/riders', label: 'Riders' },
    { path: '/ledger', label: 'Ledger' },
    { path: '/reports', label: 'Reports' },
  ];
}
