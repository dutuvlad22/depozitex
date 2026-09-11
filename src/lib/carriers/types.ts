// Interfata comuna pentru un curier — implementata de src/lib/carriers/courier-manager.ts.
// Cand se adauga un al doilea curier, el implementeaza acelasi CarrierAdapter,
// fara sa schimbe rutele API sau UI-ul din ecranul comenzii.

export type CarrierAddress = {
  name: string;
  phone: string;
  street: string;
  number?: string;
  city: string;
  county: string;
  postalCode?: string;
  country: string;
};

export type CreateShipmentInput = {
  to: CarrierAddress;
  weightKg: number;
  parcelsCount: number;
  codAmount?: number | null;
  customerReference?: string;
};

export type CreateShipmentResult =
  | { ok: true; awb: string; status: string; raw: unknown }
  | { ok: false; error: string; raw: unknown };

export type ShipmentStatusResult =
  | { ok: true; status: string; raw: unknown }
  | { ok: false; error: string; raw: unknown };

export type LabelResult =
  | { ok: true; contentType: string; bytes: ArrayBuffer }
  | { ok: false; error: string };

export type TestConnectionResult =
  | { ok: true; accountName: string; companyName: string }
  | { ok: false; error: string };

export type ServiceType = { name: string; value: string };

export interface CarrierAdapter {
  testConnection(): Promise<TestConnectionResult>;
  listServiceTypes(): Promise<ServiceType[]>;
  createShipment(serviceType: string, input: CreateShipmentInput): Promise<CreateShipmentResult>;
  getStatus(awb: string): Promise<ShipmentStatusResult>;
  getLabel(awb: string): Promise<LabelResult>;
}
