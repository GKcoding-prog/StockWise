import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

// Route map grows with each module — target structure in docs/06-frontend.md §2.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
