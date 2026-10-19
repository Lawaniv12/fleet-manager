import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Tricycle } from '../models/keke.models';

@Injectable({ providedIn: 'root' })
export class VehicleService {
  private supabase = inject(SupabaseService).client;
  
  #vehicles = signal<Tricycle[]>([]);
  vehicles = this.#vehicles.asReadonly();
  loading = signal(false);

  async fetchVehicles() {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.from('tricycles').select('*');
      if (error) throw error;
      this.#vehicles.set(data || []);
    } finally {
      this.loading.set(false);
    }
  }

  async addVehicle(vehicle: Partial<Tricycle>) {
    const { data, error } = await this.supabase.from('tricycles').insert(vehicle).select();
    if (error) throw error;
    if (data) this.#vehicles.update(v => [...data, ...v]);
  }

  async updateVehicle(id: string, vehicle: Partial<Tricycle>) {
    const { data, error } = await this.supabase.from('tricycles').update(vehicle).eq('id', id).select();
    if (error) throw error;
    if (data) this.#vehicles.update(vehicles => vehicles.map(item => item.id === id ? { ...item, ...data[0] } : item));
  }

  async deleteVehicle(id: string) {
    const { error } = await this.supabase.from('tricycles').delete().eq('id', id);
    if (error) throw error;
    this.#vehicles.update(vehicles => vehicles.filter(item => item.id !== id));
  }
}
