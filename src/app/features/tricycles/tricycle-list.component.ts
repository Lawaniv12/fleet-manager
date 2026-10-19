import { Component, inject, OnInit, signal } from '@angular/core';
import { Rider, RiderAssignment, Tricycle } from '../../core/models/keke.models';
import { LedgerService } from '../../core/services/ledger.service';
import { RiderService } from '../../core/services/rider.service';
import { VehicleService } from '../../core/services/vehicle.service';

@Component({
  selector: 'app-tricycle-list',
  templateUrl: './tricycle-list.component.html',
  styleUrl: './tricycle-list.component.scss'
})

export class TricycleListComponent implements OnInit {
  protected readonly vehicleService = inject(VehicleService);
  protected readonly riderService = inject(RiderService);
  protected readonly ledgerService = inject(LedgerService);
  protected readonly editing = signal<Tricycle | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly assignmentTricycle = signal<Tricycle | null>(null);
  protected readonly assignmentOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);
  protected readonly today = new Date().toISOString().slice(0, 10);
  
  ngOnInit() { 
    this.vehicleService.fetchVehicles(); 
    this.riderService.fetchRiders();
  }

  protected openForm(vehicle?: Tricycle): void {
    this.editing.set(vehicle ?? null);
    this.formOpen.set(true);
    this.message.set('');
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected async saveVehicle(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    const vehicle: Partial<Tricycle> = {
      plate_number: String(data.get('plate_number') ?? '').trim().toUpperCase(),
      color: String(data.get('color') ?? '').trim(),
      purchase_cost: Number(data.get('purchase_cost')) || 0,
      registration_date: String(data.get('registration_date') ?? ''),
      status: String(data.get('status') ?? 'Active') as Tricycle['status']
    };
    this.busy.set(true);
    this.message.set('');
    try {
      const selected = this.editing();
      if (selected?.id) await this.vehicleService.updateVehicle(selected.id, vehicle);
      else await this.vehicleService.addVehicle(vehicle);
      this.closeForm();
      this.message.set(selected ? 'Tricycle details updated.' : 'Tricycle added successfully.');
      this.messageIsError.set(false);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not save tricycle.');
      this.messageIsError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteVehicle(vehicle: Tricycle): Promise<void> {
    if (!vehicle.id || !window.confirm(`Delete tricycle ${vehicle.plate_number}? This cannot be undone.`)) return;
    try {
      await this.vehicleService.deleteVehicle(vehicle.id);
      this.message.set('Tricycle deleted.');
      this.messageIsError.set(false);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not delete tricycle.');
      this.messageIsError.set(true);
    }
  }

  protected openAssignment(vehicle: Tricycle): void {
    this.assignmentTricycle.set(vehicle);
    this.assignmentOpen.set(true);
    this.message.set('');
  }

  protected closeAssignment(): void {
    this.assignmentOpen.set(false);
    this.assignmentTricycle.set(null);
  }

  protected activeRider(vehicle: Tricycle): Rider | undefined {
    const assignment = this.ledgerService.assignments().find(item => item.tricycle_id === vehicle.id && item.is_active);
    return assignment?.rider ?? this.riderService.riders().find(rider => rider.id === assignment?.rider_id);
  }

  protected async assignRider(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const vehicle = this.assignmentTricycle();
    if (!(form instanceof HTMLFormElement) || !vehicle?.id) return;
    const data = new FormData(form);
    const assignment: RiderAssignment = {
      rider_id: String(data.get('rider_id') ?? ''),
      tricycle_id: vehicle.id,
      agreement_amount: Number(data.get('agreement_amount')),
      payment_cycle_days: Number(data.get('payment_cycle_days')),
      start_date: String(data.get('start_date') ?? ''),
      is_active: true
    };
    this.busy.set(true);
    this.message.set('');
    try {
      await this.ledgerService.assignRider(assignment);
      this.closeAssignment();
      this.message.set('Rider assignment saved.');
      this.messageIsError.set(false);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not save assignment.');
      this.messageIsError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}