import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ConceptsLayout from './concepts-layout';

// Renders the Concepts shell at a given /concepts path. The nested route just
// echoes a marker so we can assert the outlet still renders (deep links work).
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/concepts" element={<ConceptsLayout />}>
          <Route path="define" element={<div>define-view</div>} />
          <Route path="browser" element={<div>browser-view</div>} />
          <Route path="browser/:iri" element={<div>concept-detail-view</div>} />
          <Route path="search" element={<div>search-view</div>} />
          <Route path="hierarchy" element={<div>hierarchy-view</div>} />
          <Route path="collections" element={<div>collections-view</div>} />
          <Route path="generator" element={<div>generator-view</div>} />
          <Route path="import" element={<div>import-view</div>} />
          <Route path="enrich" element={<div>enrich-view</div>} />
          <Route path="mapping" element={<div>mapping-view</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const PAGES = ['define', 'browser', 'search', 'hierarchy', 'collections', 'generator', 'import', 'enrich', 'mapping'];

describe('ConceptsLayout', () => {
  // The side menu's Build → Concepts lists the pages (Task 16c): the layout
  // no longer draws its own Define / Explore / Enrich section switch
  it('has no "Concept sections" switch on any concept page', () => {
    for (const page of PAGES) {
      const { unmount } = renderAt(`/concepts/${page}`);
      expect(screen.queryByRole('tablist', { name: 'Concept sections' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Concept sections')).not.toBeInTheDocument();
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(screen.getByText(`${page}-view`)).toBeInTheDocument();
      unmount();
    }
  });

  it('keeps the Simple/Advanced mode switch', () => {
    renderAt('/concepts/browser');
    expect(screen.getByRole('group', { name: 'View mode' })).toBeInTheDocument();
  });

  it('keeps the browser/:iri deep link working (outlet renders detail view)', () => {
    renderAt('/concepts/browser/some%3Airi');
    expect(screen.getByText('concept-detail-view')).toBeInTheDocument();
  });
});
