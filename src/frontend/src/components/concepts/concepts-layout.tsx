import { Outlet } from 'react-router-dom';
import { ConceptModeSwitch } from '@/components/concepts/mode-switch';
import classes from './concepts-layout.module.css';

// ---------------------------------------------------------------------------
// Concept Builder layout: the shared Simple/Advanced switch above the active
// concept view. The side menu's Build → Concepts lists the pages (Define,
// Explore, Search, Hierarchy Browser, Enrich, Term Mapping, Collections), so the layout no
// longer draws its own Define / Explore / Enrich section switch (Task 16c).
// Generator is reached from the Define page (Collections has its menu item).
// On the page kit's tokens since wave 2 Task 12a (concepts-layout.module.css).
// ---------------------------------------------------------------------------

export default function ConceptsLayout() {
  return (
    <div className={classes.layout}>
      {/* No page title here: each view owns its own header/actions row. The
          global SPARQL link was removed: the concept detail page hosts an
          in-page SPARQL modal (scoped to the concept). The compact S | L
          (Simple/Advanced) switch is shared across all Concepts views. */}
      <div className={classes.bar}>
        <ConceptModeSwitch />
      </div>

      <div className={classes.outlet}>
        <Outlet />
      </div>
    </div>
  );
}
