import type { StockStatus } from '@stockwise/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useBusinessKey } from '@/app/auth';
import { api, type Paginated } from '@/lib/api';
import type { Movement, Product } from '@/lib/types';

export type StockList = Paginated<Product> & { summary: Record<StockStatus, number> };

export function useStock(filters: {
  q?: string;
  categoryId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'inventory', 'stock', filters],
    queryFn: () => api<StockList>('/inventory/stock', { query: { ...filters } }),
    placeholderData: keepPreviousData,
  });
}

export function useMovements(
  filters: {
    productId?: string;
    type?: string;
    from?: string;
    to?: string;
    flagged?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
  enabled = true,
) {
  const b = useBusinessKey();
  return useQuery({
    queryKey: [b, 'inventory', 'movements', filters],
    queryFn: () => api<Paginated<Movement>>('/inventory/movements', { query: { ...filters } }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
