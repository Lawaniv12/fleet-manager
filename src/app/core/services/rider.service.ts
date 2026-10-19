import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Rider } from '../models/keke.models';

@Injectable({ providedIn: 'root' })
export class RiderService {
  private supabase = inject(SupabaseService).client;

  #riders = signal<Rider[]>([]);
  riders = this.#riders.asReadonly();
  loading = signal(false);

  async fetchRiders() {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.from('riders').select('*');
      if (error) throw error;
      this.#riders.set(data || []);
    } finally {
      this.loading.set(false);
    }
  }

  async addRider(rider: Partial<Rider>) {
    const { data, error } = await this.supabase.from('riders').insert(rider).select();
    if (error) throw error;
    if (data) this.#riders.update(r => [...data, ...r]);
  }

  async updateRider(id: string, rider: Partial<Rider>) {
    const { data, error } = await this.supabase.from('riders').update(rider).eq('id', id).select();
    if (error) throw error;
    if (data) this.#riders.update(riders => riders.map(item => item.id === id ? { ...item, ...data[0] } : item));
  }

  async deleteRider(id: string) {
    const { error } = await this.supabase.from('riders').delete().eq('id', id);
    if (error) throw error;
    this.#riders.update(riders => riders.filter(item => item.id !== id));
  }
}
