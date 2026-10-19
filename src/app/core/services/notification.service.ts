import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  constructor() {
    this.requestPermission();
  }

  private requestPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }

  public sendLocalNotification(title: string, body: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body,
          icon: '/assets/icons/icon-192x192.png',
          badge: '/assets/icons/badge-72x72.png'
        } as NotificationOptions);
      });
    }
  }
}