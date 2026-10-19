import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Income } from '../models/keke.models';

@Injectable({ providedIn: 'root' })
export class IncomeService {
  private supabase = inject(SupabaseService).client;

  #incomes = signal<Income[]>([]);
  incomes = this.#incomes.asReadonly();
  loading = signal(false);

  async fetchIncomes() {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.from('income').select('*');
      if (error) throw error;
      this.#incomes.set(data || []);
    } finally {
      this.loading.set(false);
    }
  }

  async recordIncome(income: Partial<Income>) {
    const { data, error } = await this.supabase.from('income').insert(income).select();
    if (error) throw error;
    if (data) this.#incomes.update(i => [...data, ...i]);
  }
}