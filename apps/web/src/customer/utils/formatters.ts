import { findCatalogItem } from '../fixtures/catalog.ts';

export function getUnitLabel(sku: string, itemName?: string, uppercase = false): string {
  const catalogItem = findCatalogItem(sku);
  let label = catalogItem?.unitLabel;

  if (!label) {
    const s = (sku + ' ' + (itemName || '')).toUpperCase();
    if (s.includes('FAN')) label = 'fans';
    else if (s.includes('PMP') || s.includes('PUMP')) label = 'pumps';
    else label = 'units';
  }

  return uppercase ? label.toUpperCase() : label;
}

export function formatDateString(dateStr: string): string {
  if (!dateStr) return '';
  // Parse YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }
  return dateStr;
}

export function formatDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC'
    });
  }
  return dateStr;
}
