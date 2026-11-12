/**
 * Deprecating a certified contract directly is refused by the certified guard
 * (`certified_deprecation_requires_approval`): the dialog shows the error in
 * the UI language and offers to send a status change request instead.
 *
 * The request type and target status are Mantine Selects (wave 2 Task 11),
 * picked as a user would.
 */
import { cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import i18n from '@/i18n/config';
import { renderWithProviders, userEvent } from '@/test/utils';
import { pick, selectField } from '@/test/kit-dialog';
import RequestContractActionDialog from './request-contract-action-dialog';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: mockGet, post: mockPost }) }));
vi.mock('@/stores/notifications-store', () => ({
  useNotificationsStore: (selector: any) => selector({ refreshNotifications: vi.fn() }),
}));
const REFUSED = {
  data: {},
  error: "The data contract 'Orders' is certified: deprecating it needs an approved status "
    + 'change request. Request the status change instead.',
  errorCode: 'certified_deprecation_requires_approval',
  errorParams: {
    entityType: 'data_contract', entityId: 'c-1', entityName: 'Orders', certificationLevel: 1,
  },
};

/** Picks an option by its label, in the Select of that label. */
async function choose(label: string, option: string) {
  const field = selectField(screen.getByRole('dialog'), label);
  await pick(userEvent.setup(), field, option);
}

describe('RequestContractActionDialog certified deprecation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockReset();  // drop answers a failed test left queued
    mockGet.mockResolvedValue({ data: [] });
  });

  afterEach(async () => {
    // Unmount first: a language change would update the open dialog outside act
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('shows the refusal in the UI language and sends a request instead', async () => {
    await i18n.changeLanguage('pt');
    mockPost.mockResolvedValueOnce(REFUSED).mockResolvedValueOnce({ data: {} });
    renderWithProviders(
      <RequestContractActionDialog
        isOpen={true}
        onOpenChange={vi.fn()}
        contractId="c-1"
        contractName="Orders"
        contractStatus="active"
        canDirectStatusChange={true}
      />,
    );

    await choose(i18n.t('data-contracts:requests.requestTypeLabel'), i18n.t('data-contracts:requests.statusChange.changeTitle'));
    await choose(i18n.t('data-contracts:requests.statusChange.selectTargetLabel'), i18n.t('data-contracts:status.deprecated'));
    fireEvent.click(screen.getByRole('button', {
      name: i18n.t('data-contracts:requests.statusChange.changeTitle'),
    }));

    const text = 'Orders é certificado, então só pode ser descontinuado por uma solicitação de '
      + 'mudança de status aprovada. Solicite a mudança de status.';
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(mockPost.mock.calls[0][0]).toBe('/api/data-contracts/c-1/change-status');

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar a mudança de status' }));
    const justification = document.getElementById('status-justification') as HTMLTextAreaElement;
    fireEvent.change(justification, {
      target: { value: 'Replaced by Orders v2; every consumer has moved.' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: i18n.t('data-contracts:requests.sendRequest'),
    }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0]).toBe('/api/data-contracts/c-1/request-status-change');
    expect(mockPost.mock.calls[1][1]).toMatchObject({
      target_status: 'deprecated', current_status: 'active',
    });
  });
});
