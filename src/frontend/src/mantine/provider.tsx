import type { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { cssVariablesResolver, theme } from './theme';

/** Mantine for the whole app, light only. Its CSS is imported by index.css. */
export function AppMantineProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} forceColorScheme="light" cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  );
}
