/** The Helix and Ask Ontos panels are never open together. */
import { beforeEach, describe, expect, it } from 'vitest';
import { useCopilotStore } from '@/stores/copilot-store';
import { HELIX_DEFAULTS, useHelixStore } from './helix-store';

const helixOpen = () => useHelixStore.getState().isOpen;
const copilotOpen = () => useCopilotStore.getState().isOpen;

describe('Helix and Ask Ontos panels', () => {
  beforeEach(() => {
    useHelixStore.setState(HELIX_DEFAULTS);
    useCopilotStore.setState({ isOpen: false });
  });

  it('opening Helix closes Ask Ontos', () => {
    useCopilotStore.getState().actions.openPanel();
    useHelixStore.getState().actions.open();
    expect(helixOpen()).toBe(true);
    expect(copilotOpen()).toBe(false);
  });

  it('opening Ask Ontos closes Helix', () => {
    useHelixStore.getState().actions.open();
    useCopilotStore.getState().actions.openPanel();
    expect(copilotOpen()).toBe(true);
    expect(helixOpen()).toBe(false);
  });

  it('toggling Ask Ontos open closes Helix', () => {
    useHelixStore.getState().actions.open();
    useCopilotStore.getState().actions.togglePanel();
    expect(copilotOpen()).toBe(true);
    expect(helixOpen()).toBe(false);
  });

  it('closing either panel leaves the other alone', () => {
    useHelixStore.getState().actions.open();
    useCopilotStore.getState().actions.closePanel();
    expect(helixOpen()).toBe(true);

    useHelixStore.getState().actions.close();
    useCopilotStore.getState().actions.openPanel();
    useHelixStore.getState().actions.close();
    expect(copilotOpen()).toBe(true);
  });
});
