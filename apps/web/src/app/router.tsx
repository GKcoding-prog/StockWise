import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { NoBusinessPage } from '@/features/auth/NoBusinessPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { AppLayout } from './AppLayout';
import { ProtectedRoute, PublicOnlyRoute, RequirePermission } from './guards';

/** Feature pages load on demand, so the login screen stays small on slow mobile data. */
function page(
  load: () => Promise<Record<string, React.ComponentType>>,
  name: string,
): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] }) };
}

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/no-business', element: <NoBusinessPage /> },
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            ...page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
          },
          {
            element: <RequirePermission perm="products.view" />,
            children: [
              {
                path: 'products',
                ...page(() => import('@/features/products/ProductsPage'), 'ProductsPage'),
              },
              {
                path: 'products/:id',
                ...page(() => import('@/features/products/ProductDetailPage'), 'ProductDetailPage'),
              },
              {
                path: 'inventory',
                ...page(() => import('@/features/inventory/StockPage'), 'StockPage'),
              },
            ],
          },
          {
            element: <RequirePermission perm="inventory.view_movements" />,
            children: [
              {
                path: 'inventory/movements',
                ...page(() => import('@/features/inventory/MovementsPage'), 'MovementsPage'),
              },
            ],
          },
          {
            element: <RequirePermission perm="suppliers.view" />,
            children: [
              {
                path: 'suppliers',
                ...page(() => import('@/features/suppliers/SuppliersPage'), 'SuppliersPage'),
              },
              {
                path: 'suppliers/:id',
                ...page(
                  () => import('@/features/suppliers/SupplierDetailPage'),
                  'SupplierDetailPage',
                ),
              },
            ],
          },
          {
            element: <RequirePermission perm="purchases.view" />,
            children: [
              {
                path: 'purchases',
                ...page(() => import('@/features/purchases/PurchasesPage'), 'PurchasesPage'),
              },
              {
                path: 'purchases/:id',
                ...page(
                  () => import('@/features/purchases/PurchaseDetailPage'),
                  'PurchaseDetailPage',
                ),
              },
            ],
          },
          {
            element: <RequirePermission perm="purchases.manage" />,
            children: [
              {
                path: 'purchases/new',
                ...page(() => import('@/features/purchases/PurchaseFormPage'), 'PurchaseFormPage'),
              },
              {
                path: 'purchases/:id/edit',
                ...page(() => import('@/features/purchases/PurchaseFormPage'), 'PurchaseFormPage'),
              },
            ],
          },
          {
            path: 'settings',
            element: <Navigate to="/settings/profile" replace />,
          },
          {
            path: 'settings/profile',
            ...page(() => import('@/features/settings/ProfilePage'), 'ProfilePage'),
          },
          {
            element: <RequirePermission perm="business.manage" />,
            children: [
              {
                path: 'settings/business',
                ...page(
                  () => import('@/features/settings/BusinessSettingsPage'),
                  'BusinessSettingsPage',
                ),
              },
            ],
          },
          {
            element: <RequirePermission perm="products.view" />,
            children: [
              {
                path: 'settings/categories',
                ...page(() => import('@/features/settings/CategoriesPage'), 'CategoriesPage'),
              },
            ],
          },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
