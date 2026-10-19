import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth',
  imports: [RouterLink],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss'
})
export class AuthComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeData = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
  readonly isRegister = computed(() => this.routeData()['mode'] === 'register');
  readonly busy = signal(false);
  readonly errorMessage = signal('');
  readonly infoMessage = signal('');

  async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const values = new FormData(form);
    const email = String(values.get('email') ?? '').trim();
    const password = String(values.get('password') ?? '');
    this.errorMessage.set('');
    this.infoMessage.set('');
    this.busy.set(true);

    try {
      if (this.isRegister()) {
        const signedIn = await this.auth.register(email, password);
        if (!signedIn) {
          this.infoMessage.set('Check your email to confirm your account, then sign in.');
          return;
        }
      } else {
        await this.auth.signIn(email, password);
      }

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const destination = returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/dashboard';
      await this.router.navigateByUrl(destination);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to authenticate. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}