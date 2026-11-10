import { Outlet } from 'react-router-dom';
import { ConceptModeSwitch } from '@/components/concepts/mode-switch';

// ---------------------------------------------------------------------------
// Concept Builder layout: the shared Simple/Advanced switch above the active
// concept view. The side menu's Build → Concepts lists the pages (Define,
// Explore, Search, Hierarchy Browser, Enrich, Term Mapping), so the layout no
// longer draws its own Define / Explore / Enrich section switch (Task 16c).
// Collections and Generator are reached from the Define page.
// ---------------------------------------------------------------------------

export default function ConceptsLayout() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* No page title here: each view owns its own header/actions row. */}
        <div className="flex items-center justify-end gap-4 border-b pb-3">
          <div className="flex items-center gap-2">
            {/* The global SPARQL link was removed: the concept detail page now
                hosts an in-page SPARQL modal (scoped to the concept), so the
                layout-level shortcut to the legacy Search page is redundant. */}
            {/* Compact S | L (Simple/Advanced) switch, shared across all
                Concepts views; per-view copies are removed. */}
            <ConceptModeSwitch />
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
