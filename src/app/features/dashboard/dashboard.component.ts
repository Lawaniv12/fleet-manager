import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Income, LedgerItem, RiderAssignment } from '../../core/models/keke.models';
import { LedgerService } from '../../core/services/ledger.service';
import { RiderService } from '../../core/services/rider.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { NotificationService } from '../../core/services/notification.service';
import { NairaCurrencyPipe } from '../../shared/pipes/naira-currency.pipe';

type MetricIcon = 'fleet' | 'riders' | 'expected' | 'received' | 'outstanding' | 'expenses' | 'profit';

interface MetricCard {
  label: string;
  value: number;
  format: 'currency' | 'count';
  note: string;
  icon: MetricIcon;
  iconClass: string;
  valueClass: string;
}

interface TrendPoint {
  key: string;
  label: string;
  amount: number;
  height: number;
}

interface OverdueRider {
  id: string;
  name: string;
  tricycle: string;
  amountDue: number;
  cycleAmount: number;
  daysOverdue: number;
  dueDate: string;
  phone: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, NairaCurrencyPipe, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  protected readonly ledgerService = inject(LedgerService);
  private readonly vehicleService = inject(VehicleService);
  private readonly riderService = inject(RiderService);
  protected readonly notificationService = inject(NotificationService);
  private readonly dashboardLoadError = signal('');
  protected readonly notificationMessage = signal('');
  protected readonly notificationError = signal(false);

  protected readonly currentDate = new Date();
  protected readonly greeting = this.getGreeting();
  protected readonly isLoading = computed(
    () => this.ledgerService.loading() || this.vehicleService.loading() || this.riderService.loading()
  );
  protected readonly dataLoadError = computed(
    () => this.dashboardLoadError() || this.ledgerService.dataLoadError()
  );

  protected readonly metrics = computed<MetricCard[]>(() => {
    const financials = this.ledgerService.dashboardMetrics();
    const activeRiders = new Set(
      this.ledgerService.assignments()
        .filter(assignment => assignment.is_active && assignment.rider_id)
        .map(assignment => assignment.rider_id)
    ).size;

    return [
      {
        label: 'Total tricycles',
        value: this.vehicleService.vehicles().length,
        format: 'count',
        note: 'Across your fleet',
        icon: 'fleet',
        iconClass: 'bg-blue-50 text-blue-700',
        valueClass: 'text-slate-950'
      },
      {
        label: 'Active riders',
        value: activeRiders,
        format: 'count',
        note: 'With active agreements',
        icon: 'riders',
        iconClass: 'bg-indigo-50 text-indigo-700',
        valueClass: 'text-slate-950'
      },
      {
        label: 'Expected income',
        value: financials.expectedIncomeMonth,
        format: 'currency',
        note: 'Expected this month',
        icon: 'expected',
        iconClass: 'bg-sky-50 text-sky-700',
        valueClass: 'text-slate-950'
      },
      {
        label: 'Received income',
        value: financials.receivedIncomeMonth,
        format: 'currency',
        note: 'Collected this month',
        icon: 'received',
        iconClass: 'bg-emerald-50 text-emerald-700',
        valueClass: 'text-emerald-700'
      },
      {
        label: 'Outstanding amount',
        value: financials.outstandingAmount,
        format: 'currency',
        note: 'Still to be collected',
        icon: 'outstanding',
        iconClass: 'bg-amber-50 text-amber-800',
        valueClass: 'text-amber-800'
      },
      {
        label: 'Total expenses',
        value: financials.totalExpensesMonth,
        format: 'currency',
        note: 'Spent this month',
        icon: 'expenses',
        iconClass: 'bg-rose-50 text-rose-700',
        valueClass: 'text-rose-700'
      },
      {
        label: 'Net profit',
        value: financials.netProfitMonth,
        format: 'currency',
        note: 'Income less expenses',
        icon: 'profit',
        iconClass: 'bg-teal-50 text-teal-700',
        valueClass: financials.netProfitMonth < 0 ? 'text-rose-700' : 'text-emerald-700'
      }
    ];
  });

  protected readonly recentActivity = computed(() =>
    [...this.ledgerService.ledgerTimeline()]
      .sort((a, b) => Date.parse(b.txn_date) - Date.parse(a.txn_date))
      .slice(0, 6)
  );

  protected readonly overdueRiders = computed<OverdueRider[]>(() => {
    const assignments = this.ledgerService.assignments();
    const incomes = this.ledgerService.incomes();

    return assignments
      .filter(assignment => assignment.is_active)
      .map(assignment => this.toOverdueRider(assignment, incomes))
      .filter((rider): rider is OverdueRider => rider !== null)
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 5);
  });

  protected readonly incomeTrend = computed(() => this.buildTrend('income'));
  protected readonly expenseTrend = computed(() => this.buildTrend('expense'));

  protected async enableReminders(): Promise<void> {
    this.notificationMessage.set('');
    try {
      await this.notificationService.enableReminders();
      this.notificationMessage.set('Browser reminders enabled on this device.');
      this.notificationError.set(false);
    } catch (error) {
      this.notificationMessage.set(error instanceof Error ? error.message : 'Could not enable browser reminders.');
      this.notificationError.set(true);
    }
  }

  ngOnInit(): void {
    void Promise.allSettled([
      this.ledgerService.loadInitialData(),
      this.vehicleService.fetchVehicles(),
      this.riderService.fetchRiders()
    ]).then(results => {
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason));
      this.dashboardLoadError.set(failures.join(' '));
    });
  }

  protected activityTitle(item: LedgerItem): string {
    return item.description?.trim() || item.category || (item.txn_type === 'income' ? 'Rider payment' : 'Operating expense');
  }

  protected activityMeta(item: LedgerItem): string {
    if (item.txn_type === 'income' && item.rider_id) {
      const riderName = this.ledgerService.assignments().find(assignment => assignment.rider_id === item.rider_id)?.rider?.name
        ?? this.riderService.riders().find(rider => rider.id === item.rider_id)?.name;
      if (riderName) return riderName;
    }

    return this.vehicleLabel(item.tricycle_id);
  }

  protected vehicleLabel(tricycleId: string): string {
    const tricycle = this.vehicleService.vehicles().find(vehicle => vehicle.id === tricycleId);
    return tricycle?.plate_number || 'Tricycle';
  }

  protected formatAmount(item: LedgerItem): number {
    return Math.abs(Number(item.amount) || 0);
  }

  protected isIncome(item: LedgerItem): boolean {
    return item.txn_type === 'income';
  }

  protected reminderUrl(rider: OverdueRider): string {
    let phone = rider.phone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = `234${phone.slice(1)}`;
    const dueDate = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(`${rider.dueDate}T12:00:00`));
    const amountDue = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2 }).format(rider.cycleAmount);
    const outstanding = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2 }).format(rider.amountDue);
    const message = `Hello ${rider.name},\n\nYour Keke payment of ₦${amountDue} was due on ${dueDate}.\n\nOutstanding Amount: ₦${outstanding}\n\nPlease make payment as soon as possible.\n\nThank you.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  private getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  private toOverdueRider(assignment: RiderAssignment, incomes: Income[]): OverdueRider | null {
    const paymentCycleDays = Math.max(1, Number(assignment.payment_cycle_days) || 2);
    const lastPayment = incomes
      .filter(income => income.rider_assignment_id === assignment.id
        || (!income.rider_assignment_id
          && income.rider_id === assignment.rider_id
          && income.payment_date >= assignment.start_date))
      .reduce<Income | undefined>((latest, income) => {
        if (!latest || Date.parse(income.payment_date) > Date.parse(latest.payment_date)) return income;
        return latest;
      }, undefined);
    const lastPaymentDate = lastPayment?.payment_date.slice(0, 10)
      || assignment.last_payment_date?.slice(0, 10)
      || assignment.start_date.slice(0, 10);
    const calculatedDue = new Date(`${lastPaymentDate}T12:00:00`);
    calculatedDue.setDate(calculatedDue.getDate() + paymentCycleDays);
    const dueDate = assignment.next_due_date?.slice(0, 10) || calculatedDue.toISOString().slice(0, 10);
    const dueTime = Date.parse(`${dueDate}T00:00:00`);
    if (!Number.isFinite(dueTime)) return null;
    const daysOverdue = Math.floor((new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.currentDate.getDate()).getTime() - dueTime) / 86_400_000);
    if (daysOverdue <= 0) return null;

    const matchedRider = this.riderService.riders().find(rider => rider.id === assignment.rider_id);
    const riderName = assignment.rider?.name
      || matchedRider?.name
      || 'Unassigned rider';
    const tricycle = assignment.tricycle?.plate_number || this.vehicleLabel(assignment.tricycle_id);
    const overdueCycles = Math.ceil((daysOverdue + 1) / paymentCycleDays);

    return {
      id: assignment.id || `${assignment.rider_id}-${assignment.tricycle_id}`,
      name: riderName,
      tricycle,
      amountDue: Number(assignment.agreement_amount) * overdueCycles,
      cycleAmount: Number(assignment.agreement_amount),
      daysOverdue,
      dueDate,
      phone: assignment.rider?.phone || matchedRider?.phone || ''
    };
  }

  private buildTrend(type: 'income' | 'expense'): TrendPoint[] {
    const ledger = this.ledgerService.ledgerTimeline();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 5 + index, 1);
      const amount = ledger
        .filter(item => {
          const transactionDate = new Date(item.txn_date);
          return item.txn_type === type
            && transactionDate.getMonth() === date.getMonth()
            && transactionDate.getFullYear() === date.getFullYear();
        })
        .reduce((total, item) => total + (Number(item.amount) || 0), 0);

      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: new Intl.DateTimeFormat('en-NG', { month: 'short' }).format(date),
        amount
      };
    });
    const maxAmount = Math.max(...months.map(month => month.amount), 0);

    return months.map(month => ({
      ...month,
      height: maxAmount === 0 ? 4 : Math.max(month.amount === 0 ? 4 : 12, (month.amount / maxAmount) * 100)
    }));
  }
}
