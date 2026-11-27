export interface CatalogItem {
  sku: string;
  name: string;
  category: string;
  unitLabel: string;
  defaultQuantity: number;
  defaultDestination: string;
  standardOrigin: string;
  bufferOrigin: string;
  description: string;
  splitRatio: { primary: number; secondary: number }; // e.g. 40/10 for 50 fans, 15/5 for 20 pumps
}

export const PRODUCT_CATALOG: CatalogItem[] = [
  {
    sku: 'FAN-HV-24-IND',
    name: 'High-Velocity 24" Industrial Pedestal Fans',
    category: 'Ventilation & Air Movement',
    unitLabel: 'fans',
    defaultQuantity: 50,
    defaultDestination: 'Manipal Commercial Center, Shop #14',
    standardOrigin: 'Udupi Regional Hub',
    bufferOrigin: 'Mangalore Buffer Depot via Udupi',
    description: 'Heavy-duty 3-speed industrial oscillation fans for commercial exhibits and warehouse retail.',
    splitRatio: { primary: 40, secondary: 10 }
  },
  {
    sku: 'PMP-SUB-05-AGR',
    name: '0.5 HP Submersible Agricultural Water Pump',
    category: 'Water Management & Irrigation',
    unitLabel: 'pumps',
    defaultQuantity: 20,
    defaultDestination: 'Brahmavar Agro Cooperative Society, Warehouse #3',
    standardOrigin: 'Mangalore Industrial Depot',
    bufferOrigin: 'Udupi Buffer Yard',
    description: 'Stainless steel borewell submersible pump with dual-bearing motor and thermal overload protection.',
    splitRatio: { primary: 15, secondary: 5 }
  }
];

export function findCatalogItem(skuOrName: string): CatalogItem | undefined {
  const query = skuOrName.trim().toLowerCase();
  return PRODUCT_CATALOG.find(
    item => item.sku.toLowerCase() === query || item.name.toLowerCase().includes(query)
  );
}
