import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Income, Expense, LedgerItem, RiderAssignment, DashboardMetrics } from '../models/keke.models';

@Injectable({
  providedIn: 'root'
})
export class LedgerService {
  private supabase = inject(SupabaseService).client;

  // Signals for state
  public incomes = signal<Income[]>([]);
  public expenses = signal<Expense[]>([]);
  public assignments = signal<RiderAssignment[]>([]);
  public ledgerTimeline = signal<LedgerItem[]>([]);
  public loading = signal<boolean>(false);
  public dataLoadError = signal('');
  // Add this inside your LedgerService class in src/app/core/services/ledger.service.ts:



  constructor() {
    this.loadInitialData();
  }

  async loadInitialData() {
    this.loading.set(true);
    this.dataLoadError.set('');
    const results = await Promise.allSettled([
      this.fetchIncomes(),
      this.fetchExpenses(),
      this.fetchAssignments(),  
      this.fetchLedgerTimeline()
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason));
    this.dataLoadError.set(failures.join(' '));
    this.loading.set(false);
  }

  async fetchIncomes() {
    const { data, error } = await this.supabase.from('income').select('*').order('payment_date', { ascending: false });
    if (error) throw error;
    if (data) this.incomes.set(data);
  }

  async fetchExpenses() {
    const { data, error } = await this.supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    if (error) throw error;
    if (data) this.expenses.set(data);
  }

  async fetchAssignments() {
    const { data, error } = await this.supabase
      .from('rider_assignments')
      .select('*, rider:riders(*), tricycle:tricycles(*)')
      .order('start_date', { ascending: false });
    if (error) throw error;
    this.assignments.set(data ?? []);
  }

  async fetchLedgerTimeline() {
    const { data, error } = await this.supabase.from('ledger_view').select('*').order('txn_date', { ascending: false });
    if (error) throw error;
    if (data) this.ledgerTimeline.set(data);
  }

  async recordIncome(income: Income) {
    const { error } = await this.supabase.from('income').insert([income]);
    if (!error) await this.loadInitialData();
    if (error) throw error;
  }

  async recordExpense(expense: Expense) {
    const { error } = await this.supabase.from('expenses').insert([expense]);
    if (!error) await this.loadInitialData();
    if (error) throw error;
  }

  async assignRider(assignment: RiderAssignment) {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await this.supabase.rpc('assign_rider', {
      p_rider_id: assignment.rider_id,
      p_tricycle_id: assignment.tricycle_id,
      p_agreement_amount: assignment.agreement_amount,
      p_payment_cycle_days: assignment.payment_cycle_days,
      p_start_date: assignment.start_date || today
    });
    if (error) throw error;
    await this.loadInitialData();
  }

  async recordRiderPayment(income: Income): Promise<void> {
    if (!income.rider_assignment_id) throw new Error('Choose the active agreement for this payment.');
    const { error } = await this.supabase.rpc('record_rider_payment', {
      p_assignment_id: income.rider_assignment_id,
      p_amount: income.amount,
      p_payment_date: income.payment_date,
      p_notes: income.notes ?? null
    });
    if (error) throw error;
    await this.loadInitialData();
  }

  // Computed Dashboard Metrics
  public dashboardMetrics = computed<DashboardMetrics>(() => {
    const incList = this.incomes();
    const expList = this.expenses();
    const assignList = this.assignments().filter(assignment => assignment.is_active);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const receivedIncomeMonth = incList
      .filter(i => {
        const d = new Date(i.payment_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    const totalExpensesMonth = expList
      .filter(e => {
        const d = new Date(e.expense_date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    // Simple estimation of expected income based on active agreements cycle
    const expectedIncomeMonth = assignList.reduce((acc, curr) => {
      const cyclesPerMonth = 30 / (curr.payment_cycle_days || 2);
      return acc + (curr.agreement_amount * cyclesPerMonth);
    }, 0);

    const netProfitMonth = receivedIncomeMonth - totalExpensesMonth;
    const outstandingAmount = Math.max(0, expectedIncomeMonth - receivedIncomeMonth);

    // Overdue logic count estimation
    let overdueCount = 0;
    // Check against last payment per assignment
    for (const assign of assignList) {
      const lastInc = incList
        .filter(income => income.rider_assignment_id === assign.id
          || (!income.rider_assignment_id
            && income.rider_id === assign.rider_id
            && income.payment_date >= assign.start_date))
        .sort((a, b) => Date.parse(b.payment_date) - Date.parse(a.payment_date))[0];
      const lastDate = lastInc ? new Date(lastInc.payment_date) : new Date(assign.start_date);
      const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
      if (diffDays > assign.payment_cycle_days) {
        overdueCount++;
      }
    }

    return {
      expectedIncomeMonth,
      receivedIncomeMonth,
      outstandingAmount,
      totalExpensesMonth,
      netProfitMonth,
      overdueCount
    };
  });
}