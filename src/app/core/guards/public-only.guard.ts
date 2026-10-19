import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const publicOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    await auth.initialize();
  } catch {
    return true;
  }
  return auth.session() ? router.createUrlTree(['/dashboard']) : true;
};