import type {
  CancelPurchaseInput,
  CreatePurchaseInput,
  ReceivePurchaseInput,
  SupplierReturnInput,
  UpdatePurchaseInput,
} from '@stockwise/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBusinessKey } from '@/app/auth';
import { useInvalidateStock } from '@/features/products/queries';
import { api, type Paginated } from '@/lib/api';
import type { Movement, PurchaseDetail, PurchaseSummary } from '@/lib/types';

export interface PurchaseFilters {
  q?: string;
  status?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}

export function usePurchases(filters: PurchaseFilters) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'purchases', 'list', filters],
    queryFn: ({ signal }) =>
      api<Paginated<PurchaseSummary>>('/purchases', {
        query: { ...filters },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function usePurchase(id: string | undefined) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'purchases', 'detail', id],
    queryFn: () => api<PurchaseDetail>(`/purchases/${id}`),
    enabled: !!id,
  });
}

export function usePurchaseMovements(id: string, enabled: boolean) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'purchases', 'movements', id],
    queryFn: () => api<{ data: Movement[] }>(`/purchases/${id}/movements`),
    select: (r) => r.data,
    enabled,
  });
}

/** Purchases also show on supplier pages (open orders), so refresh both. */
function useInvalidatePurchases() {
  const qc = useQueryClient();
  const b = useBusinessKey();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [b, 'purchases'] }),
      qc.invalidateQueries({ queryKey: [b, 'suppliers'] }),
    ]);
}

export function useSavePurchase(id?: string) {
  const invalidate = useInvalidatePurchases();
  return useMutation({
    mutationFn: (body: CreatePurchaseInput | UpdatePurchaseInput) =>
      id
        ? api<PurchaseDetail>(`/purchases/${id}`, { method: 'PATCH', body })
        : api<PurchaseDetail>('/purchases', { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export function useOrderPurchase(id: string) {
  const invalidate = useInvalidatePurchases();
  return useMutation({
    mutationFn: () => api<PurchaseDetail>(`/purchases/${id}/order`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}

export function useCancelPurchase(id: string) {
  const invalidate = useInvalidatePurchases();
  return useMutation({
    mutationFn: (body: CancelPurchaseInput) =>
      api<PurchaseDetail>(`/purchases/${id}/cancel`, { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

/** Stock-changing actions also refresh products, stock and the dashboard. */
export function useReceivePurchase(id: string) {
  const invalidatePurchases = useInvalidatePurchases();
  const invalidateStock = useInvalidateStock();
  return useMutation({
    mutationFn: ({
      body,
      idempotencyKey,
    }: {
      body: ReceivePurchaseInput;
      idempotencyKey: string;
    }) =>
      api<PurchaseDetail>(`/purchases/${id}/receive`, {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    onSuccess: () => Promise.all([invalidatePurchases(), invalidateStock()]),
  });
}

export function useSupplierReturn(id: string) {
  const invalidatePurchases = useInvalidatePurchases();
  const invalidateStock = useInvalidateStock();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: SupplierReturnInput; idempotencyKey: string }) =>
      api<PurchaseDetail>(`/purchases/${id}/supplier-returns`, {
        method: 'POST',
        body,
        idempotencyKey,
      }),
    onSuccess: () => Promise.all([invalidatePurchases(), invalidateStock()]),
  });
}
