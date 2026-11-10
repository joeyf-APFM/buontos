/**
 * Mounts the approval wizard, open, in its own React root on a page of the
 * running app, so a Playwright spec can measure each step with the app's real
 * CSS. Vite serves this file, so it shares the app's React, Radix, Mantine and
 * i18n instances. The spec answers the wizard's API calls (see fixtures()
 * in approval-wizard.spec.ts).
 *
 *   const { mountWizard } = await import('/tests/e2e/fixtures/wizard-harness.tsx');
 *   mountWizard({ preselectedWorkflowId: 'wf-legal_document' });
 */
import { createRoot, type Root } from 'react-dom/client';
import { AppMantineProvider } from '@/mantine/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import ApprovalWizardDialog from '@/components/workflows/approval-wizard-dialog';

export interface WizardScene {
  /** Omit to show the workflow chooser. */
  preselectedWorkflowId?: string;
  previewMode?: boolean;
}

let root: Root | null = null;

/** Hides the app and mounts the wizard for one scene. */
export function mountWizard(scene: WizardScene) {
  document.getElementById('root')?.style.setProperty('display', 'none');
  const host = document.createElement('div');
  document.body.append(host);
  root?.unmount();
  root = createRoot(host);
  root.render(
    <AppMantineProvider>
      <TooltipProvider>
        <ApprovalWizardDialog
          isOpen
          onOpenChange={() => {}}
          entityType="data_product"
          entityId="dp-1"
          entityName="Customer 360"
          completionAction="subscribe"
          preselectedWorkflowId={scene.preselectedWorkflowId}
          autoStartWithPreselected={!!scene.preselectedWorkflowId}
          previewMode={scene.previewMode}
        />
      </TooltipProvider>
    </AppMantineProvider>,
  );
}
