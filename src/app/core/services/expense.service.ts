import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Expense } from '../models/keke.models';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private supabase = inject(SupabaseService).client;

  #expenses = signal<Expense[]>([]);
  expenses = this.#expenses.asReadonly();
  loading = signal(false);

  async fetchExpenses() {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.from('expenses').select('*');
      if (error) throw error;
      this.#expenses.set(data || []);
    } finally {
      this.loading.set(false);
    }
  }

  async addExpense(expense: Partial<Expense>) {
    const { data, error } = await this.supabase.from('expenses').insert(expense).select();
    if (error) throw error;
    if (data) this.#expenses.update(e => [...data, ...e]);
  }
}