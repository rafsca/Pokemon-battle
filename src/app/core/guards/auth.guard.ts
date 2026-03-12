import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  while (auth.isLoading()) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/auth'], {
    queryParams: { redirectTo: state.url },
  });
};
