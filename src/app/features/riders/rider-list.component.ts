import { Component, inject, OnInit, signal } from '@angular/core';
import { Rider } from '../../core/models/keke.models';
import { RiderService } from '../../core/services/rider.service';

@Component({
  selector: 'app-rider-list',
  templateUrl: './rider-list.component.html',
  styleUrl: './rider-list.component.scss'
})
export class RiderListComponent implements OnInit {
  protected readonly riderService = inject(RiderService);
  protected readonly editing = signal<Rider | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);
  
  ngOnInit() { 
    this.riderService.fetchRiders(); 
  }

  protected getInitials(name: string): string {
    if (!name) return 'RK';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  protected openForm(rider?: Rider): void {
    this.editing.set(rider ?? null);
    this.formOpen.set(true);
    this.message.set('');
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected async saveRider(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    const rider: Partial<Rider> = {
      name: String(data.get('name') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      address: String(data.get('address') ?? '').trim(),
      emergency_contact: String(data.get('emergency_contact') ?? '').trim(),
      national_id: String(data.get('national_id') ?? '').trim() || undefined
    };
    this.busy.set(true);
    this.message.set('');
    try {
      const selected = this.editing();
      if (selected?.id) await this.riderService.updateRider(selected.id, rider);
      else await this.riderService.addRider(rider);
      this.closeForm();
      this.message.set(selected ? 'Rider details updated.' : 'Rider added successfully.');
      this.messageIsError.set(false);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not save rider.');
      this.messageIsError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteRider(rider: Rider): Promise<void> {
    if (!rider.id || !window.confirm(`Delete ${rider.name}? This cannot be undone.`)) return;
    try {
      await this.riderService.deleteRider(rider.id);
      this.message.set('Rider deleted.');
      this.messageIsError.set(false);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not delete rider.');
      this.messageIsError.set(true);
    }
  }
}
