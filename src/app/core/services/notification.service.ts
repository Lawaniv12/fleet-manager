import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly swPush = inject(SwPush);
  private readonly supabase = inject(SupabaseService).client;
  readonly remindersEnabled = signal(false);

  async enableReminders(): Promise<void> {
    if (!environment.vapidPublicKey) {
      throw new Error('Browser reminders are not configured yet. Add the VAPID public key after backend setup.');
    }
    if (!this.swPush.isEnabled) throw new Error('Browser push notifications are not available in this browser.');
    if (Notification.permission === 'denied') throw new Error('Notifications are blocked in browser settings.');

    const subscription = await this.swPush.requestSubscription({
      serverPublicKey: environment.vapidPublicKey
    });
    const keys = subscription.toJSON().keys;
    if (!keys?.['p256dh'] || !keys['auth']) throw new Error('The browser did not provide a valid push subscription.');

    const { error } = await this.supabase.from('push_subscriptions').upsert({
      endpoint: subscription.endpoint,
      p256dh: keys['p256dh'],
      auth: keys['auth'],
      user_agent: navigator.userAgent
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    this.remindersEnabled.set(true);
  }
}