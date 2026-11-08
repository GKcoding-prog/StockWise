import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import i18n from '../i18n';
import { routes } from './router';

function renderAt(path: string) {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {}))); // health stays pending
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
}

describe('routing', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the home page inside the app shell', () => {
    renderAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome to StockWise' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown URLs', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
