import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'naira',
  standalone: true
})
export class NairaCurrencyPipe implements PipeTransform {
  transform(value: number | string): string {
    const amount = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(amount)) return '₦0.00';
    
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2
    }).format(amount);
  }
}
