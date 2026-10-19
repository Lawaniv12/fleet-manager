import { Injectable, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly initialized = signal(false);
  private initialization?: Promise<void>;

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.user.set(session?.user ?? null);
      this.initialized.set(true);
    });
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      this.session.set(data.session);
      this.user.set(data.session?.user ?? null);
      this.initialized.set(true);
    });
    return this.initialization;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.session.set(data.session);
    this.user.set(data.user);
  }

  async register(email: string, password: string): Promise<boolean> {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw error;
    this.session.set(data.session);
    this.user.set(data.user);
    return data.session !== null;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    this.session.set(null);
    this.user.set(null);
  }
}