import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { AppLanguage, LanguageService } from './core/services/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  showLanguageMenu = false;
  showMobileMenu = false;

  constructor(
    public readonly auth: AuthService,
    public readonly lang: LanguageService,
  ) {}

  async onLogout(): Promise<void> {
    await this.auth.signOut();
  }

  toggleLanguageMenu(): void {
    this.showLanguageMenu = !this.showLanguageMenu;
  }

  selectLanguage(language: AppLanguage): void {
    this.lang.setLanguage(language);
    this.showLanguageMenu = false;
  }

  toggleMobileMenu(): void {
    this.showMobileMenu = !this.showMobileMenu;
  }

  closeMobileMenu(): void {
    this.showMobileMenu = false;
  }
}
