/**
 * Wave 2 Task 8a: the Data Product consumable (input port), management port
 * and support channel forms on the kit Dialog, with Mantine fields. Every
 * field, default, check, payload and toast is the Radix dialogs'; a failed
 * save shows no success toast and keeps the dialog open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import InputPortFormDialog from './input-port-form-dialog';
import ManagementPortFormDialog from './management-port-form-dialog';
import SupportChannelFormDialog from './support-channel-form-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

beforeEach(() => toast.mockClear());
afterEach(() => vi.restoreAllMocks());

const success = () => toast.mock.calls.filter(([arg]) => arg.title === 'Success');

describe('input port form dialog', () => {
  const render = (props: Partial<Parameters<typeof InputPortFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<InputPortFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('input port form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Consumable' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Define an input data dependency for this data product (ODPS v1.0.0).');
  });

  it('input port form dialog keeps its fields and actions', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Consumable' });
    expect(within(dialog).getByRole('textbox', { name: /Consumable Name/ })).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: /Consumable Name/ })).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: /Version/ })).toHaveValue('1.0.0');
    expect(within(dialog).getByRole('textbox', { name: /Contract ID/ })).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: 'Asset Type' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Asset Identifier' })).toBeInTheDocument();
    expect(within(dialog).getByText('Databricks Extensions (Optional)')).toBeInTheDocument();
    expect(within(dialog).getByText('Reference to the data contract ID (REQUIRED in ODPS v1.0.0)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Consumable' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);
  });

  it('input port form dialog checks the contract ID, then submits the port', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Consumable' });
    await user.type(within(dialog).getByRole('textbox', { name: /Consumable Name/ }), ' orders ');
    await user.click(within(dialog).getByRole('button', { name: 'Add Consumable' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Contract ID is required (ODPS v1.0.0 requirement)', variant: 'destructive' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('textbox', { name: /Contract ID/ }), 'c-1');
    await user.type(within(dialog).getByRole('textbox', { name: 'Asset Type' }), 'table');
    await user.click(within(dialog).getByRole('button', { name: 'Add Consumable' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: 'orders', version: '1.0.0', contractId: 'c-1', assetType: 'table', assetIdentifier: undefined,
    }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenLastCalledWith({ title: 'Success', description: 'Consumable added' });
  });

  it('input port form dialog shows no success toast when the save fails', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({
      initial: { name: 'orders', version: '2.0.0', contractId: 'c-1' },
      onSubmit: vi.fn(async () => { throw new Error('Port taken'); }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Consumable' });
    expect(within(dialog).getByRole('textbox', { name: /Version/ })).toHaveValue('2.0.0');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Port taken', variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('management port form dialog', () => {
  const render = (props: Partial<Parameters<typeof ManagementPortFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<ManagementPortFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('management port form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Management Port' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription(/Management ports provide access to observability/);
  });

  it('management port form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Management Port' });
    expect(within(dialog).getByRole('textbox', { name: /Port Name/ })).toHaveFocus();
    const content = selectField(dialog, /Content Type/);
    expect(content).toHaveValue('Observability');
    expect(await optionNames(user, content)).toEqual(['Discoverability', 'Observability', 'Control', 'Dictionary']);
    const type = selectField(dialog, 'Port Type');
    expect(type).toHaveValue('REST');
    expect(await optionNames(user, type)).toEqual(['REST', 'TOPIC']);
    expect(within(dialog).getByRole('textbox', { name: 'URL' })).toHaveAttribute('type', 'url');
    expect(within(dialog).getByRole('textbox', { name: 'Channel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveProperty('tagName', 'TEXTAREA');
    expect(within(dialog).getByText('Purpose of this management port')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Port' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);
  });

  it('management port form dialog refuses a bad URL, then submits the port', async () => {
    const user = userEvent.setup();
    const { onSubmit } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Management Port' });
    await user.type(within(dialog).getByRole('textbox', { name: /Port Name/ }), 'metrics');
    await user.type(within(dialog).getByRole('textbox', { name: 'URL' }), 'not a url');
    await user.click(within(dialog).getByRole('button', { name: 'Add Port' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Please enter a valid URL', variant: 'destructive' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByRole('textbox', { name: 'URL' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'URL' }), 'https://example.com/m');
    await pick(user, selectField(dialog, /Content Type/), 'Control');
    await pick(user, selectField(dialog, 'Port Type'), 'TOPIC');
    await user.click(within(dialog).getByRole('button', { name: 'Add Port' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: 'metrics', content: 'control', type: 'topic', url: 'https://example.com/m', channel: undefined, description: undefined,
    }));
    expect(toast).toHaveBeenLastCalledWith({ title: 'Success', description: 'Management port added' });
  });

  it('management port form dialog shows no success toast when the save fails', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({ initial: { name: 'metrics', content: 'dictionary', type: 'topic' }, onSubmit: vi.fn(async () => { throw new Error('nope'); }) });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Management Port' });
    expect(selectField(dialog, /Content Type/)).toHaveValue('Dictionary');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'nope', variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('support channel form dialog', () => {
  const render = (props: Partial<Parameters<typeof SupportChannelFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<SupportChannelFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('support channel form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Support Channel' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Define a support channel for users of this data product (ODPS v1.0.0).');
  });

  it('support channel form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Support Channel' });
    expect(within(dialog).getByRole('textbox', { name: /Channel Name/ })).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: /Access URL/ })).toHaveAttribute('type', 'url');
    expect(within(dialog).getByText('URL to access this support channel')).toBeInTheDocument();
    const tool = selectField(dialog, 'Tool');
    expect(tool).toHaveValue('Slack');
    expect(await optionNames(user, tool)).toEqual(['Email', 'Slack', 'Teams', 'Discord', 'Ticket', 'Other']);
    const scope = selectField(dialog, 'Scope');
    expect(scope).toHaveValue('Interactive');
    expect(await optionNames(user, scope)).toEqual(['Interactive', 'Announcements', 'Issues']);
    expect(within(dialog).getByRole('textbox', { name: 'Invitation URL' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveProperty('tagName', 'TEXTAREA');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Channel' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);
  });

  it('support channel form dialog checks the URLs, then submits the channel', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Support Channel' });
    await user.type(within(dialog).getByRole('textbox', { name: /Channel Name/ }), 'help');
    await user.click(within(dialog).getByRole('button', { name: 'Add Channel' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'URL is required' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Access URL/ }), 'https://slack.com/c/help');
    await user.type(within(dialog).getByRole('textbox', { name: 'Invitation URL' }), 'bad');
    await user.click(within(dialog).getByRole('button', { name: 'Add Channel' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Please enter a valid invitation URL' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByRole('textbox', { name: 'Invitation URL' }));
    await pick(user, selectField(dialog, 'Scope'), 'Issues');
    await user.click(within(dialog).getByRole('button', { name: 'Add Channel' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      channel: 'help', url: 'https://slack.com/c/help', description: undefined, tool: 'slack', scope: 'issues', invitationUrl: undefined,
    }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenLastCalledWith({ title: 'Success', description: 'Support channel added' });
  });

  it('support channel form dialog shows no success toast when the save fails', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({ initial: { channel: 'help', url: 'https://x.example', tool: 'email' }, onSubmit: vi.fn(async () => { throw new Error('down'); }) });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Support Channel' });
    expect(selectField(dialog, 'Tool')).toHaveValue('Email');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'down', variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
