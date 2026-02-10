
export enum BatteryCategory {
  PRIMARY = 'Batterie',
  BUTTON_CELL = 'Knopfzelle',
  RECHARGEABLE = 'Akku'
}

export type BatterySize = string;

export interface ChargingEvent {
  id: string;
  date: string;
  count: number;
}

export interface Battery {
  id: string;
  name: string;
  brand: string;
  size: string;
  category: BatteryCategory;
  quantity: number; // For Akkus: This is the "Bereit / Geladen" count
  totalQuantity: number; // For Akkus: Total physical units owned
  minQuantity: number;
  inUse: number; // For Akkus: Currently in devices or empty
  usageAccumulator: number; // Tracks units used to calculate the next batch cycle
  capacityMah?: number;
  chargeCycles?: number;
  lastCharged?: string;
  chargingHistory?: ChargingEvent[];
}
