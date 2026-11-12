/**
 * Task 9: the approval wizard at Aura density, step by step, in a real browser
 * (ruling R10: jsdom ignores the cascade). The wizard is mounted on its own
 * (fixtures/wizard-harness.tsx) and its API calls are answered here.
 *
 * Set WIZARD_CAPTURE=<dir> to also save a picture of each step.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi, type Fixtures } from './fixtures/api';
import { DATA_FIXTURES } from './fixtures/data';
import { PERSONAS } from './fixtures/personas';
import type { WizardScene } from './fixtures/wizard-harness';

const HARNESS = '/tests/e2e/fixtures/wizard-harness.tsx';
const SECONDARY = 'rgb(86, 93, 101)';
const BODY = 'rgb(44, 47, 52)';
const NAVY = 'rgb(31, 48, 102)';
const BORDER = 'rgb(226, 221, 205)';
const BORDER_SUBTLE = 'rgb(243, 239, 228)';
const WARNING = 'rgb(182, 127, 20)';
const WARNING_BG = 'rgb(255, 246, 233)';
const CRITICAL = 'rgb(212, 28, 22)';
const ACCENT_HOVER = 'rgb(51, 79, 169)';

const LONG_TERMS = Array.from({ length: 30 }, (_, i) =>
  `## Clause ${i + 1}\nThe requester keeps the data inside the **approved workspace** and deletes copies when access ends.`,
).join('\n\n');

const STEPS = {
  user_action: {
    step_id: 'reason', name: 'Business reason', step_type: 'user_action', order: 0,
    config: {
      title: 'Tell us why',
      description: 'Your reason goes to the **data owner**.',
      requires_input: true,
      minimum_input_length: 20,
      primary_field_id: 'reason',
      required_fields: [
        { id: 'reason', label: 'Business reason', type: 'text', required: true },
        { id: 'ticket', label: 'Ticket number', type: 'string' },
        { id: 'workspace', label: 'Target workspace', type: 'select', options: [{ value: 'prod', label: 'Production' }] },
      ],
      references: [{ label: 'Access policy', url: 'https://example.com/policy' }],
    },
  },
  legal_document: {
    step_id: 'terms', name: 'Terms of use', step_type: 'legal_document', order: 1,
    config: {
      title: 'Terms of use',
      body_markdown: `# Data use terms\n\n${LONG_TERMS}`,
      require_scroll_to_end: true,
      require_acknowledgement_checkbox: true,
      acknowledgement_label: 'I have read the terms',
    },
  },
  acknowledgement_checklist: {
    step_id: 'checks', name: 'Checklist', step_type: 'acknowledgement_checklist', order: 2,
    config: {
      title: 'Before you continue',
      items: [
        { id: 'pii', label: 'I will not share **PII** outside the team' },
        { id: 'retention', label: 'I follow the retention policy' },
        { id: 'updates', label: 'Send me product updates', required: false },
      ],
    },
  },
  co_signers: {
    step_id: 'cosign', name: 'Co-signers', step_type: 'co_signers', order: 3,
    config: { title: 'Add co-signers', label: 'Co-signer email', min_count: 1, max_count: 3 },
  },
  on_behalf_of: {
    step_id: 'obo', name: 'On behalf of', step_type: 'on_behalf_of', order: 4,
    config: { title: 'Who is this for?', require_justification: true },
  },
  generate_pdf: { step_id: 'pdf', name: 'Generate PDF', step_type: 'generate_pdf', order: 5, config: {} },
} as const;
type StepType = keyof typeof STEPS;
const VISUAL: StepType[] = ['user_action', 'legal_document', 'acknowledgement_checklist', 'co_signers', 'on_behalf_of'];

/** A workflow that starts at `first`, followed by the other visual steps. */
const workflow = (first: StepType, extra: Record<string, unknown> = {}) => ({
  id: `wf-${first}`,
  name: `Request access (${first})`,
  steps: [STEPS[first], ...VISUAL.filter((s) => s !== first).map((s) => STEPS[s])],
  ...extra,
});

function fixtures(first: StepType, current: Record<string, unknown> = STEPS[first]): Fixtures {
  return {
    ...DATA_FIXTURES,
    [`/api/workflows/wf-${first}`]: workflow(first),
    '/api/workflows': { workflows: [workflow('user_action'), workflow('legal_document')], total: 2 },
    '/api/approvals/sessions': { session_id: 's-1', current_step: current, step_results: [] },
    '/api/approvals/sessions/s-1/steps': { complete: true, agreement_id: 'agr-20261109-0001', pdf_storage_path: 'a.pdf', pdf_url: 'https://example.com/a.pdf' },
  };
}

// The open animations have finished (spinners run forever, so they don't count)
const settle = (page: Page) =>
  page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState === 'finished' || a.effect?.getTiming().iterations === Infinity));

async function mount(page: Page, scene: WizardScene, data: Fixtures, routes?: () => Promise<void>) {
  await page.setViewportSize({ width: 900, height: 900 });
  await mockApi(page, PERSONAS.admin, data);
  // Routes added later take precedence over mockApi's
  await routes?.();
  await page.goto('/assets');
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(async ([path, s]) => {
    const harness = await import(/* @vite-ignore */ path);
    harness.mountWizard(s);
  }, [HARNESS, scene] as const);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Measure after the open animation (zoom-in-95) has finished
  await settle(page);
  return dialog;
}


async function capture(page: Page, name: string) {
  const dir = process.env.WIZARD_CAPTURE;
  if (!dir) return;
  await settle(page);
  await page.screenshot({ path: `${dir}/${name}.png`, clip: { x: 0, y: 0, width: 900, height: 900 } });
}

const style = (loc: Locator, props: string[]) =>
  loc.evaluate((el, names) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
  }, props);
const height = async (loc: Locator) => (await loc.boundingBox())!.height;

const luminance = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const rgb = (css: string) => css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
const contrast = (a: string, b: string) => {
  const [lo, hi] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
};

/** The footer's two buttons: 28px. */
async function expectFooter(dialog: Locator, next: string) {
  for (const name of ['Cancel', next]) {
    expect(await height(dialog.getByRole('button', { name, exact: true })), name).toBe(28);
  }
}

test('chooser: one 28px row per workflow and 12px secondary text', async ({ page }) => {
  const dialog = await mount(page, {}, fixtures('user_action'));
  await expect(dialog.getByRole('button', { name: /Request access/ })).toHaveCount(2);
  await capture(page, 'chooser');
  for (const row of await dialog.getByRole('button', { name: /Request access/ }).all()) {
    expect(await height(row)).toBe(28);
    // The name on the left, the chevron on the right
    const [r, name, chevron] = [await row.boundingBox(), await row.getByText(/Request access/).boundingBox(), await row.locator('svg').boundingBox()];
    expect(name!.x - r!.x).toBeLessThan(16);
    expect(r!.x + r!.width - (chevron!.x + chevron!.width)).toBeLessThan(16);
  }
  expect(await style(dialog.getByText('Choose an approval workflow'), ['font-size', 'color'])).toEqual({
    'font-size': '12px', color: SECONDARY,
  });
  expect(await height(dialog.getByRole('button', { name: 'Cancel', exact: true }))).toBe(28);
});

test('user_action: 12px secondary labels, 28px controls, a warning hint at AA and reference links', async ({ page }) => {
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-user_action' }, fixtures('user_action'));
  await expect(dialog.getByLabel(/Business reason/)).toBeVisible();
  await capture(page, 'step-user-action');

  const label = dialog.locator('label', { hasText: 'Ticket number' });
  expect(await style(label, ['font-size', 'color'])).toEqual({ 'font-size': '12px', color: SECONDARY });
  expect(await height(dialog.getByLabel('Ticket number'))).toBe(28);
  // The Mantine Select (a textbox with a listbox, wave 2 Task 8b)
  expect(await height(dialog.getByRole('textbox', { name: 'Target workspace' }))).toBe(28);
  // The step's title is the 13px navy heading
  expect(await style(dialog.getByText('Tell us why', { exact: true }), ['font-size', 'color', 'font-weight'])).toEqual({
    'font-size': '13px', color: NAVY, 'font-weight': '600',
  });
  // The validation hint: body text on the warning fill with an amber rule
  const hint = dialog.getByText('This step requires input.');
  const h = await style(hint, ['color', 'background-color', 'border-left-color', 'font-size']);
  expect(h).toEqual({ color: BODY, 'background-color': WARNING_BG, 'border-left-color': WARNING, 'font-size': '12px' });
  expect(contrast(h.color, h['background-color'])).toBeGreaterThanOrEqual(4.5);
  // Reference documents under a border-subtle rule, links in the accent hover colour
  const refs = dialog.getByRole('region', { name: 'Reference documents' });
  expect(await style(refs, ['border-top-color', 'border-top-width'])).toEqual({
    'border-top-color': BORDER_SUBTLE, 'border-top-width': '1px',
  });
  expect((await style(refs.getByRole('link', { name: 'Access policy' }), ['color']))['color']).toBe(ACCENT_HOVER);
  // Progress: "Step 1: Business reason" in 11px secondary
  expect(await style(dialog.getByText('Step 1: Business reason'), ['font-size', 'color'])).toEqual({
    'font-size': '11px', color: SECONDARY,
  });
  await expectFooter(dialog, 'Next');
});

test('legal_document: the document in a 1px pane at 12px; the scroll hint at AA', async ({ page }) => {
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-legal_document' }, fixtures('legal_document'));
  await expect(dialog.getByRole('checkbox', { name: 'I have read the terms' })).toBeVisible();
  await capture(page, 'step-legal-document');
  const doc = dialog.getByRole('region', { name: 'Terms of use' });
  expect(await style(doc, ['border-top-width', 'border-top-color', 'border-top-left-radius', 'font-size', 'box-shadow'])).toEqual({
    'border-top-width': '1px', 'border-top-color': BORDER, 'border-top-left-radius': '4px', 'font-size': '12px', 'box-shadow': 'none',
  });
  expect((await style(doc.locator('h2').first(), ['font-size']))['font-size']).toBe('13px');
  const hint = await style(dialog.getByText('Please scroll to the bottom'), ['color', 'background-color']);
  expect(contrast(hint.color, hint['background-color'])).toBeGreaterThanOrEqual(4.5);
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled();
  // Scrolling to the end clears the hint
  await doc.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(dialog.getByText('Please scroll to the bottom')).toHaveCount(0);
  expect(await style(dialog.locator('label', { hasText: 'I have read the terms' }), ['font-size', 'color'])).toEqual({
    'font-size': '12px', color: BODY,
  });
  await expectFooter(dialog, 'Next');
});

test('acknowledgement_checklist: 12px items, a critical asterisk at AA', async ({ page }) => {
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-acknowledgement_checklist' }, fixtures('acknowledgement_checklist'));
  await expect(dialog.getByRole('checkbox')).toHaveCount(3);
  await capture(page, 'step-checklist');
  const item = dialog.locator('label', { hasText: 'I follow the retention policy' });
  expect(await style(item, ['font-size', 'color'])).toEqual({ 'font-size': '12px', color: BODY });
  const star = item.getByText('*');
  const s = await style(star, ['color']);
  expect(s.color).toBe(CRITICAL);
  expect(contrast(s.color, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(4.5);
  await expectFooter(dialog, 'Next');
});

test('co_signers: a 28px input with a 26px Add, neutral chips with named remove buttons', async ({ page }) => {
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-co_signers' }, fixtures('co_signers'));
  const input = dialog.getByPlaceholder('Co-signer email');
  await input.fill('ana@example.com');
  await input.press('Enter');
  await input.fill('data-stewards');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByText('data-stewards')).toBeVisible();
  await capture(page, 'step-co-signers');
  await expect(dialog.getByRole('button', { name: 'Remove' })).toHaveCount(2);
  expect(await height(input)).toBe(28);
  expect(await height(dialog.getByRole('button', { name: 'Add', exact: true }))).toBe(26);
  const chip = dialog.getByRole('listitem').filter({ hasText: 'ana@example.com' });
  const c = await style(chip, ['color', 'background-color', 'font-size']);
  expect(c['font-size']).toBe('12px');
  expect(contrast(c.color, c['background-color'])).toBeGreaterThanOrEqual(4.5);
  expect((await style(dialog.getByText(/Co-signers are recorded/), ['font-size', 'color']))).toEqual({
    'font-size': '11px', color: SECONDARY,
  });
  await expectFooter(dialog, 'Next');
});

test('on_behalf_of: 12px options, nested 28px controls, a justification field', async ({ page }) => {
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-on_behalf_of' }, fixtures('on_behalf_of'));
  await dialog.getByRole('radio', { name: 'Other group or service principal' }).click();
  await expect(dialog.getByPlaceholder('e.g., sales_consumers')).toBeVisible();
  await capture(page, 'step-on-behalf-of');
  expect(await style(dialog.locator('label', { hasText: 'For myself' }), ['font-size', 'color'])).toEqual({
    'font-size': '12px', color: BODY,
  });
  expect(await height(dialog.getByRole('textbox', { name: 'Principal type' }))).toBe(28);
  expect(await height(dialog.getByPlaceholder('e.g., sales_consumers'))).toBe(28);
  await expect(dialog.getByLabel(/Justification/)).toBeVisible();
  await expectFooter(dialog, 'Next');
});

test('non-visual step: a 24px spinner over 12px secondary text', async ({ page }) => {
  // The auto-submitted step never answers, so the spinner stays
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-user_action' }, fixtures('user_action', STEPS.generate_pdf), () =>
    page.route((url) => url.pathname === '/api/approvals/sessions/s-1/steps', () => {}));
  const text = dialog.getByText('Generating document...');
  await expect(text).toBeVisible();
  await capture(page, 'step-non-visual');
  expect(await style(text, ['font-size', 'color'])).toEqual({ 'font-size': '12px', color: SECONDARY });
  // The box of a turning icon grows and shrinks, so read its size (the
  // turning class is a CSS module's, so its name is hashed)
  const spinner = dialog.locator('svg[class*="spin"]').first();
  expect(await style(spinner, ['width', 'height'])).toEqual({ width: '24px', height: '24px' });
});

test('completion: 12px text, a 26px download button and a 28px close', async ({ page }) => {
  const done = { ...STEPS.user_action, config: { required_fields: [] } };
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-user_action' }, fixtures('user_action', done));
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Agreement recorded.')).toBeVisible();
  await capture(page, 'step-complete');
  expect(await style(dialog.getByText('Agreement recorded.'), ['font-size', 'color'])).toEqual({ 'font-size': '12px', color: BODY });
  expect(await style(dialog.getByText(/Agreement ID/), ['font-size', 'color'])).toEqual({ 'font-size': '11px', color: SECONDARY });
  expect(await height(dialog.getByRole('button', { name: 'Download Agreement' }))).toBe(26);
  expect(await height(dialog.getByRole('button', { name: 'Close', exact: true }).first())).toBe(28);
});

test('preview: the Preview badge in the warning tone at AA', async ({ page }) => {
  const dialog = await mount(page, { preselectedWorkflowId: 'wf-user_action', previewMode: true }, fixtures('user_action'));
  await expect(dialog.getByLabel(/Business reason/)).toBeVisible();
  await capture(page, 'step-preview');
  const badge = dialog.locator('.mantine-Badge-root', { hasText: 'Preview' });
  const b = await style(badge, ['color', 'background-color', 'border-top-color']);
  expect(b).toEqual({ color: BODY, 'background-color': WARNING_BG, 'border-top-color': WARNING });
  expect(contrast(b.color, b['background-color'])).toBeGreaterThanOrEqual(4.5);
  expect((await style(badge.locator('svg'), ['color']))['color']).toBe(WARNING);
});
