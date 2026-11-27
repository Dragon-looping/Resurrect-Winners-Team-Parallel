import {
  InterWarehouseRequest,
  NetworkAvailabilityItem,
} from '../types/inventory';
import { apiRequest } from './apiClient';

export async function fetchNetworkAvailability(token?: string): Promise<{
  ok: boolean;
  items: NetworkAvailabilityItem[];
  error?: string;
}> {
  const res = await apiRequest<{ count: number; items: NetworkAvailabilityItem[] }>(
    '/network/availability',
    { token }
  );
  if (!res.ok) {
    return { ok: false, items: [], error: res.error.message };
  }
  return { ok: true, items: res.data.items ?? [] };
}

export async function fetchNetworkRequests(
  token?: string,
  direction: 'all' | 'incoming' | 'outgoing' = 'all'
): Promise<{
  ok: boolean;
  items: InterWarehouseRequest[];
  error?: string;
}> {
  const res = await apiRequest<{ count: number; items: InterWarehouseRequest[] }>(
    `/network/requests?direction=${direction}`,
    { token }
  );
  if (!res.ok) {
    return { ok: false, items: [], error: res.error.message };
  }
  return { ok: true, items: res.data.items ?? [] };
}

export async function createStockRequest(
  payload: {
    supplying_plant_id: number;
    sku_id: number;
    requested_qty: number;
    reason?: string;
    idempotency_key?: string;
  },
  token?: string
): Promise<{ ok: boolean; request?: InterWarehouseRequest; error?: string }> {
  const res = await apiRequest<InterWarehouseRequest>('/network/requests', {
    method: 'POST',
    body: payload,
    token,
  });
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, request: res.data };
}

export async function approveStockRequest(
  requestId: number,
  approvedQty: number,
  token?: string
): Promise<{ ok: boolean; request?: InterWarehouseRequest; error?: string }> {
  const res = await apiRequest<InterWarehouseRequest>(
    `/network/requests/${requestId}/approve`,
    {
      method: 'POST',
      body: { approved_qty: approvedQty },
      token,
    }
  );
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, request: res.data };
}

export async function rejectStockRequest(
  requestId: number,
  rejectionReason: string,
  token?: string
): Promise<{ ok: boolean; request?: InterWarehouseRequest; error?: string }> {
  const res = await apiRequest<InterWarehouseRequest>(
    `/network/requests/${requestId}/reject`,
    {
      method: 'POST',
      body: { rejection_reason: rejectionReason },
      token,
    }
  );
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, request: res.data };
}

export async function dispatchStockRequest(
  requestId: number,
  token?: string
): Promise<{ ok: boolean; request?: InterWarehouseRequest; error?: string }> {
  const res = await apiRequest<InterWarehouseRequest>(
    `/network/requests/${requestId}/dispatch`,
    {
      method: 'POST',
      token,
    }
  );
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, request: res.data };
}

export async function receiveStockRequest(
  requestId: number,
  token?: string
): Promise<{ ok: boolean; request?: InterWarehouseRequest; error?: string }> {
  const res = await apiRequest<InterWarehouseRequest>(
    `/network/requests/${requestId}/receive`,
    {
      method: 'POST',
      token,
    }
  );
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, request: res.data };
}
