import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBusinessKey } from '@/app/auth';
import { api, type Paginated } from '@/lib/api';
import type { Category, Movement, Product, ProductDetail, Supplier } from '@/lib/types';

export interface ProductFilters {
  q?: string;
  categoryId?: string;
  supplierId?: string;
  stockStatus?: string;
  archived?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function useProducts(filters: ProductFilters) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'products', 'list', filters],
    queryFn: ({ signal }) =>
      api<Paginated<Product>>('/products', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'products', 'detail', id],
    queryFn: () => api<ProductDetail>(`/products/${id}`),
    enabled: !!id,
  });
}

export function useProductMovements(id: string, page: number) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'products', 'movements', id, page],
    queryFn: () =>
      api<Paginated<Movement>>(`/products/${id}/movements`, { query: { page, pageSize: 20 } }),
    placeholderData: keepPreviousData,
  });
}

/** Active categories and suppliers for pickers. */
export function useCategoryOptions() {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'categories', 'list', {}],
    queryFn: () => api<{ data: Category[] }>('/categories'),
    select: (r) => r.data,
    staleTime: 5 * 60_000,
  });
}

export function useSupplierOptions(enabled = true) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'suppliers', 'options'],
    queryFn: () => api<Paginated<Supplier>>('/suppliers', { query: { pageSize: 100 } }),
    select: (r) => r.data,
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** Anything that changes stock invalidates products, inventory and the dashboard. */
export function useInvalidateStock() {
  const qc = useQueryClient();
  const b = useBusinessKey();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [b, 'products'] }),
      qc.invalidateQueries({ queryKey: [b, 'inventory'] }),
      qc.invalidateQueries({ queryKey: [b, 'dashboard'] }),
    ]);
}

export function useSaveProduct(id?: string) {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      id
        ? api<ProductDetail>(`/products/${id}`, { method: 'PATCH', body })
        : api<ProductDetail>('/products', { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveProduct(id: string) {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (archived: boolean) =>
      api<ProductDetail>(`/products/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}
