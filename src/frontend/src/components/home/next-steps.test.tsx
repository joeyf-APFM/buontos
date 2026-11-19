import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { FeatureAccessLevel } from '@/types/settings';
import usePermissionsStore from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import NextSteps, { pickNextSteps } from './next-steps';

const LEVEL_ORDER = [FeatureAccessLevel.NONE, FeatureAccessLevel.READ_ONLY, FeatureAccessLevel.READ_WRITE, FeatureAccessLevel.ADMIN];
/** A user holding these permissions at these levels. */
const user = (held: Record<string, FeatureAccessLevel>) => (id: string, level: FeatureAccessLevel) =>
  LEVEL_ORDER.indexOf(held[id] ?? FeatureAccessLevel.NONE) >= LEVEL_ORDER.indexOf(level);
const anyMaturity = () => true;
const ids = (steps: { id: string }[]) => steps.map((s) => s.id);

describe('pickNextSteps', () => {
  it('gives a producer their three build steps', () => {
    const has = user({ 'data-contracts': FeatureAccessLevel.READ_WRITE, 'data-products': FeatureAccessLevel.READ_WRITE });
    expect(ids(pickNextSteps(has, anyMaturity))).toEqual(['create-contract', 'create-product', 'continue-draft']);
  });

  it('gives a consumer find and request steps, and no create steps', () => {
    const has = user({ 'data-products': FeatureAccessLevel.READ_ONLY, search: FeatureAccessLevel.READ_ONLY, 'my-requests': FeatureAccessLevel.READ_ONLY });
    expect(ids(pickNextSteps(has, anyMaturity))).toEqual(['browse-marketplace', 'search', 'my-requests']);
  });

  it('gives a steward review and oversight steps', () => {
    const has = user({
      'data-asset-reviews': FeatureAccessLevel.READ_ONLY, compliance: FeatureAccessLevel.READ_ONLY, 'semantic-models': FeatureAccessLevel.READ_WRITE,
    });
    expect(ids(pickNextSteps(has, anyMaturity))).toEqual(['review-assets', 'check-compliance', 'manage-concepts']);
  });

  it('keeps consumer steps away from a producer, who can read too', () => {
    const has = user({ 'data-contracts': FeatureAccessLevel.READ_WRITE, 'data-products': FeatureAccessLevel.READ_WRITE, search: FeatureAccessLevel.READ_ONLY });
    expect(ids(pickNextSteps(has, anyMaturity))).not.toContain('browse-marketplace');
    expect(ids(pickNextSteps(has, anyMaturity))).not.toContain('search');
  });

  it('mixes producer and steward for someone who is both, one each in turn', () => {
    const has = user({
      'data-contracts': FeatureAccessLevel.ADMIN, 'data-products': FeatureAccessLevel.ADMIN, 'data-asset-reviews': FeatureAccessLevel.ADMIN,
      compliance: FeatureAccessLevel.ADMIN, 'semantic-models': FeatureAccessLevel.ADMIN, search: FeatureAccessLevel.ADMIN,
      'my-requests': FeatureAccessLevel.ADMIN,
    });
    expect(ids(pickNextSteps(has, anyMaturity))).toEqual(['create-contract', 'review-assets', 'create-product']);
  });

  it('skips a step whose feature maturity is not shown', () => {
    const has = user({ compliance: FeatureAccessLevel.READ_ONLY, 'data-asset-reviews': FeatureAccessLevel.READ_ONLY });
    // Compliance is beta; with only GA shown the steward gets what is left
    const gaOnly = (m: string) => m === 'ga';
    const picked = ids(pickNextSteps(has, gaOnly));
    expect(picked).not.toContain('check-compliance');
  });

  it('gives nothing to a user with no permissions', () => {
    expect(pickNextSteps(user({}), anyMaturity)).toEqual([]);
  });
});

describe('NextSteps', () => {
  it('renders the steps as links, the first one primary', () => {
    usePermissionsStore.setState({
      isLoading: false,
      permissions: { 'data-contracts': FeatureAccessLevel.READ_WRITE, 'data-products': FeatureAccessLevel.READ_WRITE },
    } as never);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] });
    render(<MemoryRouter><NextSteps /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Next steps' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Create a data contract', 'Create a data product', 'Continue a draft product']);
    expect(links[0]).toHaveAttribute('href', '/data-contracts?new=1');
    expect(links[1]).toHaveAttribute('href', '/data-products?new=1');
  });
});
