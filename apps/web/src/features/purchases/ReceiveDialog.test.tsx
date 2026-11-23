import type { PermissionKey } from '@stockwise/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import type { PurchaseDetail } from '@/lib/types';
import { ReceiveDialog } from './PurchaseDialogs';

let permissions: PermissionKey[] = [];
vi.mock('@/app/auth', () => ({
  useCan: () => (p: PermissionKey) => permissions.includes(p),
  useBusinessKey: () => 'b1',
  useAuth: () => ({ me: { business: { currency: 'BIF', timezone: 'Africa/Bujumbura' } } }),
}));

// jsdom has no <dialog> modal support.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

const I1 = '0f8e2a0c-1c7a-4c9e-9d55-8a1b7c1e0001';
const I2 = '0f8e2a0c-1c7a-4c9e-9d55-8a1b7c1e0002';

const purchase = {
  id: 'p1',
  reference: 'PUR-2026-000007',
  status: 'PARTIALLY_RECEIVED',
  supplier: { id: 's1', name: 'Grossiste Rohero', phone: null, leadTimeDays: 5 },
  items: [
    {
      id: I1,
      productId: 'a',
      product: { id: 'a', name: 'Sucre 1 kg', sku: 'ALI-001', unit: 'pcs', allowFractional: false },
      quantityOrdered: '100.000',
      quantityReceived: '60.000',
      quantityReturned: '0.000',
      quantityRemaining: '40.000',
      unitCost: '1250.0000',
    },
    {
      id: I2,
      productId: 'b',
      product: { id: 'b', name: 'Riz (vrac)', sku: 'ALI-002', unit: 'kg', allowFractional: true },
      quantityOrdered: '50.000',
      quantityReceived: '50.000',
      quantityReturned: '0.000',
      quantityRemaining: '0.000',
      unitCost: '3800.0000',
    },
  ],
} as unknown as PurchaseDetail;

type Call = { url: string; key: string | null; body: { lines: unknown[] } };
let calls: Call[];
let responses: (() => Response)[];

function mockFetch() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({
        url,
        key: headers['Idempotency-Key'] ?? null,
        body: JSON.parse(String(init.body)),
      });
      return (responses.shift() ?? (() => Response.json(purchase)))();
    }),
  );
}

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReceiveDialog purchase={purchase} open onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe('ReceiveDialog (UC-22)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    permissions = ['purchases.receive', 'purchases.manage', 'products.view_cost'];
    responses = [];
    mockFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists only lines with something left, prefilled with the remaining quantity', () => {
    renderDialog();
    expect(screen.getByText('Sucre 1 kg')).toBeInTheDocument();
    expect(screen.queryByText('Riz (vrac)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Received now')).toHaveValue('40');
    expect(screen.getByText('1 product will be added to stock.')).toBeInTheDocument();
  });

  it('sends the quantities with an Idempotency-Key and closes', async () => {
    const onClose = renderDialog();
    const qty = screen.getByLabelText('Received now');
    await userEvent.clear(qty);
    await userEvent.type(qty, '25');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/v1/purchases/p1/receive');
    expect(calls[0].key).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(calls[0].body).toEqual({ lines: [{ purchaseItemId: I1, quantity: '25' }] });
    expect(onClose).toHaveBeenCalled();
  });

  it('reuses the key when the same request is retried after a network failure', async () => {
    responses = [
      () => {
        throw new TypeError('Failed to fetch');
      },
    ];
    const onClose = renderDialog();
    const submit = screen.getByRole('button', { name: 'Confirm receipt' });
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(submit);

    expect(calls).toHaveLength(2);
    expect(calls[1].key).toBe(calls[0].key);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses a new key when the quantities change between attempts', async () => {
    responses = [
      () => Response.json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, { status: 500 }),
    ];
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));
    const qty = screen.getByLabelText('Received now');
    await userEvent.clear(qty);
    await userEvent.type(qty, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));

    expect(calls).toHaveLength(2);
    expect(calls[1].key).not.toBe(calls[0].key);
  });

  it('sends a changed invoice cost only when it differs', async () => {
    renderDialog();
    const cost = screen.getByLabelText('Invoice cost');
    expect(cost).toHaveValue('1250');
    await userEvent.clear(cost);
    await userEvent.type(cost, '1300');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));
    expect(calls[0].body.lines).toEqual([{ purchaseItemId: I1, quantity: '40', unitCost: '1300' }]);
  });

  it('hides the cost field from employees', () => {
    permissions = ['purchases.receive'];
    renderDialog();
    expect(screen.queryByLabelText('Invoice cost')).not.toBeInTheDocument();
  });

  it('cannot be submitted with nothing to receive', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Confirm receipt' })).toBeDisabled();
    expect(screen.getByText('Enter at least one quantity.')).toBeInTheDocument();
  });

  it('shows the API error in the user’s language', async () => {
    await i18n.changeLanguage('fr');
    responses = [
      () => Response.json({ error: { code: 'OVER_RECEIPT', message: 'x' } }, { status: 409 }),
    ];
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la réception' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quantité supérieure à celle restant à recevoir.',
    );
  });
});
