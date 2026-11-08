import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { SystemStatusCard } from './SystemStatusCard';

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SystemStatusCard />
    </QueryClientProvider>,
  );
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('SystemStatusCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows API and database as operational', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { status: 'ok', db: 'up', time: '2026-11-08T10:00:00Z' }),
        ),
    );
    renderCard();
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    expect(await screen.findAllByText('Operational')).toHaveLength(2);
  });

  it('shows the database as unavailable when health returns 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(503, { status: 'degraded', db: 'down', time: '2026-11-08T10:00:00Z' }),
        ),
    );
    renderCard();
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument(); // the API itself answered
  });

  it('explains when the API is unreachable and lets the user retry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(
        jsonResponse(200, { status: 'ok', db: 'up', time: '2026-11-08T10:00:00Z' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the API");
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByText('Operational')).toHaveLength(2);
  });

  it('is translated into French', async () => {
    await i18n.changeLanguage('fr');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { status: 'ok', db: 'up', time: '2026-11-08T10:00:00Z' }),
        ),
    );
    renderCard();
    expect(await screen.findByText('État du système')).toBeInTheDocument();
    expect(await screen.findAllByText('Opérationnel')).toHaveLength(2);
  });
});
