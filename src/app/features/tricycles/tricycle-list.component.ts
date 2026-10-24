import { Component, inject, OnInit, signal } from '@angular/core';
import { Rider, RiderAssignment, Tricycle } from '../../core/models/keke.models';
import { LedgerService } from '../../core/services/ledger.service';
import { RiderService } from '../../core/services/rider.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { NairaCurrencyPipe } from '../../shared/pipes/naira-currency.pipe';
import { AgreementEvidence, AgreementEvidenceService, AgreementEvidenceType } from '../../core/services/agreement-evidence.service';

@Component({
  selector: 'app-tricycle-list',
  imports: [NairaCurrencyPipe],
  templateUrl: './tricycle-list.component.html',
  styleUrl: './tricycle-list.component.scss'
})

export class TricycleListComponent implements OnInit {
  protected readonly vehicleService = inject(VehicleService);
  protected readonly riderService = inject(RiderService);
  protected readonly ledgerService = inject(LedgerService);
  private readonly evidenceService = inject(AgreementEvidenceService);
  protected readonly editing = signal<Tricycle | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly assignmentTricycle = signal<Tricycle | null>(null);
  protected readonly assignmentOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);
  protected readonly evidence = signal<AgreementEvidence[]>([]);
  protected readonly evidenceLinks = signal<Record<string, string>>({});
  protected readonly today = new Date().toISOString().slice(0, 10);
  
  ngOnInit() { 
    this.vehicleService.fetchVehicles(); 
    this.riderService.fetchRiders();
    void this.refreshEvidence();
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

  protected agreementRiderName(assignment: RiderAssignment): string {
    return assignment.rider?.name
      ?? this.riderService.riders().find(rider => rider.id === assignment.rider_id)?.name
      ?? 'Unknown rider';
  }

  protected agreementTricycleLabel(assignment: RiderAssignment): string {
    return assignment.tricycle?.plate_number
      ?? this.vehicleService.vehicles().find(vehicle => vehicle.id === assignment.tricycle_id)?.plate_number
      ?? 'Unknown tricycle';
  }

  protected evidenceFor(assignmentId?: string): AgreementEvidence[] {
    return this.evidence().filter(item => item.assignment_id === assignmentId);
  }

  protected async uploadEvidence(event: Event, assignmentId: string, evidenceType: AgreementEvidenceType): Promise<void> {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.busy.set(true);
    this.message.set('');
    try {
      await this.evidenceService.upload(assignmentId, evidenceType, file);
      await this.refreshEvidence();
      this.message.set('Agreement evidence uploaded.');
      this.messageIsError.set(false);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not upload agreement evidence.');
      this.messageIsError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private async refreshEvidence(): Promise<void> {
    try {
      const evidence = await this.evidenceService.fetchAll();
      const links = await Promise.all(evidence.map(async item => {
        try {
          return [item.id, await this.evidenceService.createSignedUrl(item.storage_path)] as const;
        } catch {
          return [item.id, ''] as const;
        }
      }));
      this.evidence.set(evidence);
      this.evidenceLinks.set(Object.fromEntries(links));
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not load agreement evidence.');
      this.messageIsError.set(true);
    }
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