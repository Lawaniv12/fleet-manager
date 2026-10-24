import { Component, inject, OnInit, signal, WritableSignal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LedgerService } from '../../core/services/ledger.service';
import { NairaCurrencyPipe } from '../../shared/pipes/naira-currency.pipe';
import { ExpenseCategory, Income, LedgerItem } from '../../core/models/keke.models';
import { RiderService } from '../../core/services/rider.service';
import { VehicleService } from '../../core/services/vehicle.service';

@Component({
  selector: 'app-ledger-timeline',
  imports: [DatePipe, NairaCurrencyPipe],
  templateUrl: './ledger-timeline.component.html',
  styleUrl: './ledger-timeline.component.scss'
})
export class LedgerTimelineComponent implements OnInit {
  protected readonly ledgerService = inject(LedgerService);
  protected readonly riderService = inject(RiderService);
  protected readonly vehicleService = inject(VehicleService);
  protected readonly paymentFormOpen = signal(false);
  protected readonly expenseFormOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly expenseCategories: ExpenseCategory[] = [
    'Fuel Support', 'Tire', 'Repair', 'Engine', 'Registration', 'Union Fees', 'Police Issue', 'Miscellaneous'
  ];
  
  ngOnInit() { 
    void this.ledgerService.loadInitialData();
    void this.vehicleService.fetchVehicles();
    void this.riderService.fetchRiders();
  }

  protected getLabel(item: LedgerItem): string {
    return item.category || (item.txn_type === 'income' ? 'Rental Income' : 'Operating Expense');
  }

  protected getDescription(item: LedgerItem): string {
    return item.description || 'N/A';
  }

  protected async recordPayment(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    const riderId = String(data.get('rider_id') ?? '');
    const assignment = this.ledgerService.assignments().find(item => item.rider_id === riderId && item.is_active);
    if (!assignment) {
      this.message.set('The selected rider has no active tricycle assignment.');
      this.messageIsError.set(true);
      return;
    }
    const payment: Income = {
      amount: Number(data.get('amount')),
      payment_date: String(data.get('payment_date') ?? ''),
      rider_id: riderId,
      tricycle_id: assignment.tricycle_id,
      rider_assignment_id: assignment.id,
      notes: String(data.get('notes') ?? '').trim() || undefined
    };
    await this.submitEntry(() => this.ledgerService.recordRiderPayment(payment), 'Payment recorded successfully.', this.paymentFormOpen);
  }

  protected async recordExpense(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    await this.submitEntry(() => this.ledgerService.recordExpense({
      amount: Number(data.get('amount')),
      expense_date: String(data.get('expense_date') ?? ''),
      category: String(data.get('category') ?? 'Miscellaneous') as ExpenseCategory,
      description: String(data.get('description') ?? '').trim(),
      tricycle_id: String(data.get('tricycle_id') ?? '')
    }), 'Expense recorded successfully.', this.expenseFormOpen);
  }

  private async submitEntry(action: () => Promise<void>, success: string, formOpen: WritableSignal<boolean>): Promise<void> {
    this.busy.set(true);
    this.message.set('');
    try {
      await action();
      formOpen.set(false);
      this.message.set(success);
      this.messageIsError.set(false);
    } catch (error) {
      this.message.set(this.getErrorMessage(error));
      this.messageIsError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = error.message;
      const code = 'code' in error && typeof error.code === 'string' ? ` (${error.code})` : '';
      if (typeof message === 'string') return `${message}${code}`;
    }
    return 'Could not save this ledger entry.';
  }
}
