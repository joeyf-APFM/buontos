/**
 * Wave 2 Task 11 (part 1): the Data Contract section form dialogs on the kit
 * Dialog, with Mantine fields: schema, quality rule, server configuration,
 * SLA, custom property and authoritative definition. Every field, default,
 * check, payload and toast is the Radix dialogs'; a failed save shows no
 * success toast and keeps the dialog open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import SchemaFormDialog from './schema-form-dialog';
import QualityRuleFormDialog from './quality-rule-form-dialog';
import ServerConfigFormDialog from './server-config-form-dialog';
import SLAFormDialog from './sla-form-dialog';
import CustomPropertyFormDialog from './custom-property-form-dialog';
import AuthoritativeDefinitionFormDialog from './authoritative-definition-form-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));
// The concept picker (BusinessConceptsDisplay) looks up its concepts even while closed
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: vi.fn(async () => ({ data: [] })), post: vi.fn(), put: vi.fn(), delete: vi.fn() }) }));

beforeEach(() => toast.mockClear());
afterEach(() => vi.restoreAllMocks());

const success = () => toast.mock.calls.filter(([arg]) => arg.title === 'Success');

describe('schema form dialog', () => {
  const render = (props: Partial<Parameters<typeof SchemaFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<SchemaFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };
  const initial = {
    name: 'customers',
    physicalName: 'main.sales.customers',
    physicalType: 'view',
    properties: [{ name: 'id', logicalType: 'string' }],
    relationships: [{ type: 'foreignKey', from: 'region_id', to: 'regions.id' }],
    tableType: 'MANAGED',
    owner: 'data-team',
    tableProperties: { 'delta.appendOnly': 'true' },
  };

  it('schema form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add New Schema' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Define a schema object (table/view) and its properties (columns).');
  });

  /** The schema's own fields and its relationships: the column editor below has fields of the same names */
  const parts = (dialog: HTMLElement) => ({
    info: within(dialog).getByRole('region', { name: 'Schema Information' }),
    relationships: within(dialog).getByRole('region', { name: 'Relationships (Foreign Keys)' }),
  });

  it('schema form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add New Schema' });
    const { info, relationships } = parts(dialog);
    expect(within(info).getByRole('textbox', { name: /^Name/ })).toBeRequired();
    expect(within(info).getByRole('textbox', { name: 'Physical Name' })).toHaveValue('');
    expect(within(info).getByRole('textbox', { name: 'Business Name' })).toBeInTheDocument();
    const physicalType = selectField(info, 'Physical Type');
    expect(physicalType).toHaveValue('table');
    expect(await optionNames(user, physicalType)).toEqual([
      'table', 'view', 'materialized_view', 'external_table', 'managed_table', 'streaming_table',
    ]);
    expect(within(info).getByRole('textbox', { name: 'Description' })).toHaveProperty('tagName', 'TEXTAREA');
    expect(within(info).getByRole('textbox', { name: 'Data Granularity' })).toBeInTheDocument();
    const concepts = within(dialog).getByRole('group', { name: 'Business Concepts' });
    expect(within(concepts).getByRole('button', { name: 'Add Concept' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Properties \(Columns\)/ })).toBeInTheDocument();
    expect(within(relationships).getByRole('textbox', { name: 'From (local column)' })).toBeInTheDocument();
    expect(within(relationships).getByRole('textbox', { name: 'To (target reference)' })).toBeInTheDocument();
    const relType = selectField(relationships, 'Type');
    expect(await optionNames(user, relType)).toEqual(['foreignKey', 'reference']);
    expect(within(relationships).getByRole('button', { name: 'Add Relationship' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Schema' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    // The column editor (SchemaPropertyEditor) is shared and unchanged: only the schema's own parts are checked
    expectNoOldMarkup(info);
    expectNoOldMarkup(relationships);
  });

  it('schema form dialog shows the read-only Unity Catalog metadata and named relationship removes', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = render({ initial: initial as never });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Schema' });
    const { info, relationships } = parts(dialog);
    expect(within(info).getByRole('textbox', { name: /^Name/ })).toHaveValue('customers');
    expect(selectField(info, 'Physical Type')).toHaveValue('view');
    expect(within(dialog).getByRole('heading', { name: 'Unity Catalog Metadata (Read-Only)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Table Type' })).toBeDisabled();
    expect(within(dialog).getByRole('textbox', { name: 'Table Type' })).toHaveValue('MANAGED');
    expect(within(dialog).getByRole('textbox', { name: 'Owner' })).toHaveValue('data-team');
    expect(within(dialog).getByText('delta.appendOnly:')).toBeInTheDocument();

    // A relationship is added, and one removed by its named button
    await user.type(within(relationships).getByRole('textbox', { name: 'From (local column)' }), 'owner_id');
    await user.type(within(relationships).getByRole('textbox', { name: 'To (target reference)' }), 'users.id');
    await pick(user, selectField(relationships, 'Type'), 'reference');
    await user.click(within(relationships).getByRole('button', { name: 'Add Relationship' }));
    expect(within(relationships).getByRole('textbox', { name: 'From (local column)' })).toHaveValue('');
    expect(selectField(relationships, 'Type')).toHaveValue('foreignKey');
    await user.click(within(relationships).getByRole('button', { name: 'Remove relationship region_id → regions.id' }));

    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'customers',
      physicalName: 'main.sales.customers',
      physicalType: 'view',
      relationships: [{ type: 'reference', from: 'owner_id', to: 'users.id' }],
    })));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('schema form dialog checks the name and columns, and keeps open on a failed save', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({
      initial: { name: 'customers', properties: [{ name: 'id', logicalType: 'string' }] } as never,
      onSubmit: vi.fn(async () => { throw new Error('Schema taken'); }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Schema' });
    const { info } = parts(dialog);
    await user.clear(within(info).getByRole('textbox', { name: /^Name/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Schema name is required', variant: 'destructive' }));

    await user.type(within(info).getByRole('textbox', { name: /^Name/ }), 'customers');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Schema taken', variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('quality rule form dialog', () => {
  const render = (props: Partial<Parameters<typeof QualityRuleFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<QualityRuleFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('quality rule form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Quality Rule' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Define a data quality check for this contract.');
  });

  it('quality rule form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onSubmit } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Quality Rule' });
    expect(within(dialog).getByRole('textbox', { name: /Rule Name/ })).toBeRequired();
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveProperty('tagName', 'TEXTAREA');
    const level = selectField(dialog, 'Level');
    expect(level).toHaveValue('object');
    expect(await optionNames(user, level)).toEqual(['contract', 'object', 'property']);
    const dimension = selectField(dialog, 'Dimension');
    expect(dimension).toHaveValue('completeness');
    expect(await optionNames(user, dimension)).toEqual(['accuracy', 'completeness', 'conformity', 'consistency', 'coverage', 'timeliness', 'uniqueness']);
    const severity = selectField(dialog, 'Severity');
    expect(severity).toHaveValue('warning');
    expect(await optionNames(user, severity)).toEqual(['info', 'warning', 'error']);
    const impact = selectField(dialog, 'Business Impact');
    expect(impact).toHaveValue('operational');
    expect(await optionNames(user, impact)).toEqual(['operational', 'regulatory']);
    const type = selectField(dialog, 'Type');
    expect(type).toHaveValue('library');
    expect(await optionNames(user, type)).toEqual(['text', 'library', 'sql', 'custom']);
    expect(within(dialog).queryByRole('textbox', { name: 'SQL Query' })).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Rule Expression' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Rule' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);

    // The SQL query shows for an SQL rule, and goes in the payload
    await pick(user, type, 'sql');
    await user.type(within(dialog).getByRole('textbox', { name: /Rule Name/ }), ' No nulls ');
    await user.type(within(dialog).getByRole('textbox', { name: 'SQL Query' }), 'SELECT 1');
    await pick(user, severity, 'error');
    await user.click(within(dialog).getByRole('button', { name: 'Add Rule' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: 'No nulls', description: undefined, level: 'object', dimension: 'completeness',
      businessImpact: 'operational', severity: 'error', type: 'sql', query: 'SELECT 1', rule: undefined,
    }));
  });
});

describe('server config form dialog', () => {
  const render = (props: Partial<Parameters<typeof ServerConfigFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<ServerConfigFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('server config form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Server Configuration' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Define server/connection details for this data contract.');
  });

  it('server config form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Server Configuration' });
    expect(within(dialog).getByRole('textbox', { name: /Server Name/ })).toBeRequired();
    const type = selectField(dialog, 'Type');
    expect(type).toHaveValue('databricks');
    const types = await optionNames(user, type);
    expect(types).toHaveLength(31);
    expect(types.slice(0, 3)).toEqual(['api', 'athena', 'azure']);
    const environment = selectField(dialog, 'Environment');
    expect(environment).toHaveValue('production');
    expect(await optionNames(user, environment)).toEqual(['production', 'staging', 'development', 'test']);
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveProperty('tagName', 'TEXTAREA');
    expect(within(dialog).getByRole('textbox', { name: 'Host' })).toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton', { name: 'Port' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Database/Catalog' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Schema' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Location / URI' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Custom Properties' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'New property key' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Property' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Server' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);
  });

  it('server config form dialog edits custom properties and submits the server', async () => {
    const user = userEvent.setup();
    const { onSubmit } = render({ initial: { id: 's-1', server: 'prod', type: 'snowflake', port: 443, properties: { region: 'us', tier: 'gold' } } });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Server Configuration' });
    expect(selectField(dialog, 'Type')).toHaveValue('snowflake');
    expect(within(dialog).getByRole('spinbutton', { name: 'Port' })).toHaveValue(443);
    // Enter adds a key, as does the button
    await user.type(within(dialog).getByRole('textbox', { name: 'New property key' }), 'owner{Enter}');
    expect(within(dialog).getByRole('textbox', { name: 'New property key' })).toHaveValue('');
    await user.type(within(dialog).getByRole('textbox', { name: 'Value of owner' }), 'ops');
    await user.click(within(dialog).getByRole('button', { name: 'Remove tier' }));
    await pick(user, selectField(dialog, 'Environment'), 'staging');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      id: 's-1', server: 'prod', type: 'snowflake', description: undefined, environment: 'staging',
      host: undefined, port: 443, database: undefined, schema: undefined, location: undefined,
      properties: { region: 'us', owner: 'ops' },
    }));
  });
});

describe('SLA form dialog', () => {
  const render = (props: Partial<Parameters<typeof SLAFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<SLAFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('SLA form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Edit SLA Requirements' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Define service level agreement requirements for this contract.');
  });

  it('SLA form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = render({ initial: { uptimeTarget: 99.9 } });
    const dialog = await screen.findByRole('dialog', { name: 'Edit SLA Requirements' });
    const uptime = within(dialog).getByRole('spinbutton', { name: 'Uptime Target (%)' });
    expect(uptime).toHaveValue(99.9);
    expect(uptime).toHaveAccessibleDescription('Expected uptime percentage (0-100)');
    expect(within(dialog).getByRole('spinbutton', { name: 'Max Downtime (minutes)' })).toHaveAccessibleDescription('Maximum acceptable downtime per month');
    expect(within(dialog).getByRole('spinbutton', { name: 'Query Response Time (ms)' })).toHaveAccessibleDescription('Maximum query response time in milliseconds');
    const freshness = within(dialog).getByRole('spinbutton', { name: 'Data Freshness (minutes)' });
    expect(freshness).toHaveAccessibleDescription('How fresh the data should be (in minutes)');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);

    await user.type(freshness, '15');
    await user.click(within(dialog).getByRole('button', { name: 'Save SLA' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      uptimeTarget: 99.9, maxDowntimeMinutes: undefined, queryResponseTimeMs: undefined, dataFreshnessMinutes: 15,
    }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe('custom property form dialog', () => {
  const render = (props: Partial<Parameters<typeof CustomPropertyFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<CustomPropertyFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('custom property form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Custom Property' });
    expectKitDialog(dialog);
  });

  it('custom property form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onSubmit } = render({ existingKeys: ['tier'] });
    const dialog = await screen.findByRole('dialog', { name: 'Add Custom Property' });
    const name = within(dialog).getByRole('textbox', { name: 'Property Name' });
    const valueType = selectField(dialog, 'Value Type');
    expect(valueType).toHaveValue('String');
    expect(await optionNames(user, valueType)).toEqual(['String', 'Number', 'Boolean', 'JSON (Array/Object)']);
    expect(within(dialog).getByRole('textbox', { name: 'Value' })).toHaveAttribute('type', 'text');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);

    // The checks show in the dialog
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Property name is required')).toBeInTheDocument();
    await user.type(name, 'tier');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('A property with this name already exists')).toBeInTheDocument();

    // A boolean is picked from its own list; JSON is checked and formatted
    await user.clear(name);
    await user.type(name, 'flags');
    await pick(user, valueType, 'Boolean');
    const bool = selectField(dialog, 'Value');
    expect(await optionNames(user, bool)).toEqual(['true', 'false']);
    await pick(user, valueType, 'JSON (Array/Object)');
    const json = within(dialog).getByRole('textbox', { name: 'Value' });
    expect(json).toHaveProperty('tagName', 'TEXTAREA');
    await user.type(json, '[[1');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Invalid JSON format')).toBeInTheDocument();
    await user.clear(json);
    await user.type(json, '{{"a":1}');
    await user.click(within(dialog).getByRole('button', { name: 'Format JSON' }));
    expect(json).toHaveValue('{\n  "a": 1\n}');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ property: 'flags', value: '{\n  "a": 1\n}' }));
  });

  it('custom property form dialog fills an edited property, and shows a failed save in the dialog', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({
      initial: { property: 'score', value: '0.8' },
      onSubmit: vi.fn(async () => { throw new Error('Save refused'); }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Custom Property' });
    expect(within(dialog).getByRole('textbox', { name: 'Property Name' })).toBeDisabled();
    expect(selectField(dialog, 'Value Type')).toHaveValue('Number');
    expect(within(dialog).getByRole('spinbutton', { name: 'Value' })).toHaveValue(0.8);
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    expect(await within(dialog).findByText('Save refused')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('authoritative definition form dialog', () => {
  const render = (props: Partial<Parameters<typeof AuthoritativeDefinitionFormDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(async () => {});
    renderWithMantine(<AuthoritativeDefinitionFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} level="schema" {...props} />);
    return { onOpenChange, onSubmit };
  };

  it('authoritative definition form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Authoritative Definition' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Schema-level authoritative source (ODCS compliant)');
  });

  it('authoritative definition form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Authoritative Definition' });
    const url = within(dialog).getByRole('textbox', { name: /URL/ });
    expect(url).toHaveFocus();
    expect(url).toBeRequired();
    expect(url).toHaveAttribute('type', 'url');
    expect(url).toHaveAccessibleDescription('Full URL to the authoritative source');
    const type = within(dialog).getByRole('textbox', { name: /Type/ });
    expect(type).toBeRequired();
    expect(type).toHaveAttribute('maxLength', '255');
    expect(type).toHaveAccessibleDescription('Type of authoritative source');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);

    await user.type(url, 'not a url');
    await user.type(type, 'glossary');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Please enter a valid URL', variant: 'destructive' }));
    await user.clear(url);
    await user.type(url, 'https://glossary.example.com/term/1');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ url: 'https://glossary.example.com/term/1', type: 'glossary' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenLastCalledWith({ title: 'Success', description: 'Authoritative definition created' });
  });

  it('authoritative definition form dialog shows no success toast when the save fails', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render({
      initial: { url: 'https://glossary.example.com/term/1', type: 'glossary' },
      onSubmit: vi.fn(async () => { throw new Error('Definition refused'); }),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Authoritative Definition' });
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Definition refused', variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
