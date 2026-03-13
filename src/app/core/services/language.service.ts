import { Injectable, computed, signal } from '@angular/core';
import { SelectedMove } from '../models/move.model';

export type AppLanguage = 'it' | 'en';

const STORAGE_KEY = 'pokemon-battle.app-language.v1';

const UI_TEXT: Record<string, { it: string; en: string }> = {
  navBattle: { it: 'Battaglia', en: 'Battle' },
  navBattlePro: { it: 'Battaglia Pro 🔒', en: 'Battle Pro 🔒' },
  navPokemonGenerator: { it: 'Generatore Pokémon', en: 'Pokemon Generator' },
  navLogin: { it: 'Accedi', en: 'Login' },
  navLogout: { it: 'Esci', en: 'Logout' },
  languageItalian: { it: 'Italiano', en: 'Italian' },
  languageEnglish: { it: 'Inglese', en: 'English' },
  languageSelectAria: { it: 'Seleziona lingua', en: 'Select language' },
  moveNoDescription: { it: 'Nessuna descrizione disponibile.', en: 'No effect description available.' },
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly language = signal<AppLanguage>('it');
  readonly isItalian = computed(() => this.language() === 'it');
  readonly currentFlag = computed(() => (this.isItalian() ? '🇮🇹' : '🇬🇧'));

  constructor() {
    this.loadFromStorage();
  }

  setLanguage(lang: AppLanguage): void {
    this.language.set(lang);
    this.saveToStorage(lang);
  }

  t(key: keyof typeof UI_TEXT): string {
    const lang = this.language();
    return UI_TEXT[key]?.[lang] ?? key;
  }

  getLocalizedMoveName(move: SelectedMove): string {
    const targetLang = this.language();
    const localized = (move.names ?? []).find(n => n.language?.name === targetLang)?.name?.trim();
    if (localized) return localized;

    const english = (move.names ?? []).find(n => n.language?.name === 'en')?.name?.trim();
    if (english) return english;

    return move.name;
  }

  getLocalizedMoveEffectText(move: SelectedMove): string {
    const targetLang = this.language();
    const targetText = (move.effect_entries ?? [])
      .find(entry => entry.language?.name === targetLang)
      ?.effect
      ?.trim();

    if (targetText) return targetText;

    const english = (move.effect_entries ?? [])
      .find(entry => entry.language?.name === 'en')
      ?.effect
      ?.trim();

    if (english) return english;
    if (move.shortEffect?.trim()) return move.shortEffect.trim();

    return this.t('moveNoDescription');
  }

  getTypeLabel(typeName: string | undefined | null): string {
    if (!typeName) return 'unknown';
    if (this.language() === 'en') return typeName;

    const map: Record<string, string> = {
      normal: 'normale',
      fire: 'fuoco',
      water: 'acqua',
      electric: 'elettro',
      grass: 'erba',
      ice: 'ghiaccio',
      fighting: 'lotta',
      poison: 'veleno',
      ground: 'terra',
      flying: 'volante',
      psychic: 'psico',
      bug: 'coleottero',
      rock: 'roccia',
      ghost: 'spettro',
      dragon: 'drago',
      dark: 'buio',
      steel: 'acciaio',
      fairy: 'folletto',
    };

    return map[typeName] ?? typeName;
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'it' || raw === 'en') {
        this.language.set(raw);
      }
    } catch {
      // ignore storage errors
    }
  }

  private saveToStorage(lang: AppLanguage): void {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }
}
