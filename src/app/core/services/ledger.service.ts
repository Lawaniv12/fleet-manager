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
  // Add this inside your LedgerService class in src/app/core/services/ledger.service.ts:



  constructor() {
    this.loadInitialData();
  }

  async loadInitialData() {
    this.loading.set(true);
    await Promise.allSettled([
      this.fetchIncomes(),
      this.fetchExpenses(),
      this.fetchAssignments(),  
      this.fetchLedgerTimeline()
    ]);
    this.loading.set(false);
  }

  async fetchIncomes() {
    const { data } = await this.supabase.from('income').select('*').order('payment_date', { ascending: false });
    if (data) this.incomes.set(data);
  }

  async fetchExpenses() {
    const { data } = await this.supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    if (data) this.expenses.set(data);
  }

  async fetchAssignments() {
    const { data } = await this.supabase.from('rider_assignments').select('*, rider:riders(*), tricycle:tricycles(*)').eq('is_active', true);
    if (data) this.assignments.set(data);
  }

  async fetchLedgerTimeline() {
    const { data } = await this.supabase.from('ledger_view').select('*').order('txn_date', { ascending: false });
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
    const { error: closeError } = await this.supabase
      .from('rider_assignments')
      .update({ is_active: false, end_date: today })
      .eq('is_active', true)
      .or(`rider_id.eq.${assignment.rider_id},tricycle_id.eq.${assignment.tricycle_id}`);
    if (closeError) throw closeError;

    const { error } = await this.supabase.from('rider_assignments').insert({
      ...assignment,
      start_date: assignment.start_date || today,
      is_active: true
    });
    if (error) throw error;
    await this.loadInitialData();
  }

  async recordRiderPayment(income: Income): Promise<void> {
    const { error } = await this.supabase.from('income').insert([income]);
    if (error) throw error;

    if (income.rider_id) {
      const assignment = this.assignments().find(item => item.rider_id === income.rider_id && item.is_active);
      if (assignment?.id) {
        const lastPaymentDate = income.payment_date.slice(0, 10);
        const nextDue = new Date(`${lastPaymentDate}T12:00:00`);
        nextDue.setDate(nextDue.getDate() + Math.max(1, Number(assignment.payment_cycle_days) || 1));
        const { error: dateError } = await this.supabase.from('rider_assignments').update({
          last_payment_date: lastPaymentDate,
          next_due_date: nextDue.toISOString().slice(0, 10)
        }).eq('id', assignment.id);

        if (dateError && !this.isMissingOptionalColumn(dateError.message)) throw dateError;
      }
    }
    await this.loadInitialData();
  }

  private isMissingOptionalColumn(message: string): boolean {
    return message.toLowerCase().includes('last_payment_date') || message.toLowerCase().includes('next_due_date');
  }

  // Computed Dashboard Metrics
  public dashboardMetrics = computed<DashboardMetrics>(() => {
    const incList = this.incomes();
    const expList = this.expenses();
    const assignList = this.assignments();

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
      const lastInc = incList.find(i => i.rider_id === assign.rider_id);
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