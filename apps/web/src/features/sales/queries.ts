import type { CreateSaleInput, CustomerReturnInput, VoidSaleInput } from '@stockwise/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBusinessKey } from '@/app/auth';
import { useInvalidateStock } from '@/features/products/queries';
import { api, type Paginated } from '@/lib/api';
import type { BusinessProfile, Movement, Product, SaleDetail, SaleSummary } from '@/lib/types';

export interface SaleFilters {
  q?: string;
  status?: string;
  paymentMethod?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function useSales(filters: SaleFilters) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'sales', 'list', filters],
    queryFn: ({ signal }) =>
      api<Paginated<SaleSummary>>('/sales', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSale(id: string | undefined) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'sales', 'detail', id],
    queryFn: () => api<SaleDetail>(`/sales/${id}`),
    enabled: !!id,
  });
}

export function useSaleMovements(id: string, enabled: boolean) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'sales', 'movements', id],
    queryFn: () => api<{ data: Movement[] }>(`/sales/${id}/movements`),
    select: (r) => r.data,
    enabled,
  });
}

/** Business name, receipt header and the employee discount limit. Shared with Settings. */
export function useBusinessProfile() {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'business'],
    queryFn: () => api<BusinessProfile>('/business'),
    staleTime: 5 * 60_000,
  });
}

/** Exact SKU or barcode match, for scanners. Resolves to null when nothing matches. */
export async function lookupProduct(code: string): Promise<Product | null> {
  try {
    return await api<Product>('/products/lookup', { query: { code } });
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** Every sale changes stock: refresh sales, products, stock and the dashboard. */
function useInvalidateSales() {
  const qc = useQueryClient();
  const b = useBusinessKey();
  const invalidateStock = useInvalidateStock();
  return () => Promise.all([qc.invalidateQueries({ queryKey: [b, 'sales'] }), invalidateStock()]);
}

export function useCreateSale() {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateSaleInput; idempotencyKey: string }) =>
      api<SaleDetail>('/sales', { method: 'POST', body, idempotencyKey }),
    onSuccess: () => invalidate(),
  });
}

export function useVoidSale(id: string) {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: (body: VoidSaleInput) =>
      api<SaleDetail>(`/sales/${id}/void`, { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export function useCustomerReturn(id: string) {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CustomerReturnInput; idempotencyKey: string }) =>
      api<SaleDetail>(`/sales/${id}/returns`, { method: 'POST', body, idempotencyKey }),
    onSuccess: () => invalidate(),
  });
}
