import { Injectable, computed, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase: SupabaseClient;

  user = signal<User | null>(null);
  nickname = signal<string | null>(null);
  isLoading = signal(true);
  authError = signal<string | null>(null);

  isLoggedIn = computed(() => !!this.user());
  displayName = computed(() => {
    const nick = this.nickname()?.trim();
    if (nick) return nick;

    const email = this.user()?.email?.trim();
    if (!email) return 'User';
    return email.split('@')[0] || email;
  });

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    this.initializeAuthListener();
  }

  async signUp(email: string, password: string, nickname?: string): Promise<{ ok: boolean; message?: string }> {
    this.authError.set(null);

    if (!this.isDbConfigured()) {
      return { ok: false, message: 'Configura prima le chiavi Supabase in src/environments/environment.ts' };
    }

    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (error) {
      this.authError.set(error.message);
      return { ok: false, message: error.message };
    }

    if (data.user) {
      await this.saveUserProfile(data.user.id, email, nickname);
    }

    return {
      ok: true,
      message: 'Registrazione completata. Se richiesto, conferma l’email prima del login.',
    };
  }

  async signIn(email: string, password: string): Promise<{ ok: boolean; message?: string }> {
    this.authError.set(null);

    if (!this.isDbConfigured()) {
      return { ok: false, message: 'Configura prima le chiavi Supabase in src/environments/environment.ts' };
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      this.authError.set(error.message);
      return { ok: false, message: error.message };
    }

    this.user.set(data.user ?? null);
    await this.loadUserNickname(data.user?.id ?? null);
    return { ok: true };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.user.set(null);
    this.nickname.set(null);
  }

  private async initializeAuthListener(): Promise<void> {
    if (!this.isDbConfigured()) {
      this.isLoading.set(false);
      return;
    }

    const { data } = await this.supabase.auth.getUser();
    this.user.set(data.user ?? null);
    await this.loadUserNickname(data.user?.id ?? null);
    this.isLoading.set(false);

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
      void this.loadUserNickname(session?.user?.id ?? null);
    });
  }

  private async saveUserProfile(userId: string, email: string, nickname?: string): Promise<void> {
    const { error } = await this.supabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        nickname: nickname?.trim() || null,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.warn('Impossibile salvare il profilo su DB (tabella profiles):', error.message);
    }
  }

  private isDbConfigured(): boolean {
    return !environment.supabaseUrl.includes('YOUR_SUPABASE_URL_HERE')
      && !environment.supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY_HERE');
  }

  private async loadUserNickname(userId: string | null): Promise<void> {
    if (!userId || !this.isDbConfigured()) {
      this.nickname.set(null);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('nickname')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        this.nickname.set(null);
        return;
      }

      const value = typeof data?.nickname === 'string' ? data.nickname.trim() : '';
      this.nickname.set(value || null);
    } catch {
      this.nickname.set(null);
    }
  }
}
