import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './auth-page.component.html',
  styleUrls: ['./auth-page.component.scss'],
})
export class AuthPageComponent {
  email = '';
  password = '';
  nickname = '';

  mode = signal<'login' | 'register'>('login');
  message = signal<string | null>(null);
  isSubmitting = signal(false);

  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  setMode(next: 'login' | 'register'): void {
    this.mode.set(next);
    this.message.set(null);
  }

  async onSubmit(): Promise<void> {
    this.message.set(null);
    this.isSubmitting.set(true);

    if (!this.email || !this.password) {
      this.message.set('Inserisci email e password.');
      this.isSubmitting.set(false);
      return;
    }

    if (this.mode() === 'register') {
      const res = await this.auth.signUp(this.email.trim(), this.password, this.nickname.trim());
      this.isSubmitting.set(false);
      this.message.set(res.message ?? (res.ok ? 'Registrazione completata.' : 'Registrazione fallita.'));
      if (res.ok) {
        this.mode.set('login');
      }
      return;
    }

    const res = await this.auth.signIn(this.email.trim(), this.password);
    this.isSubmitting.set(false);
    if (!res.ok) {
      this.message.set(res.message ?? 'Login fallito.');
      return;
    }

    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') || '/battle-pro';
    await this.router.navigateByUrl(redirectTo);
  }
}
