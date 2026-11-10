/**
 * The APFM Aura theme for Mantine: dense controls, Aura colours, light only.
 */
import {
  ActionIcon,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Input,
  MultiSelect,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
  TextInput,
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

export const AURA = {
  navy: '#1F3066',
  accent: '#4F6AC5',
  accentHover: '#334FA9',
  accentPressed: '#273D87',
  accentSubtle: '#F1F5FF',
  canvas: '#FFFDF7',
  surface: '#FFFFFF',
  surfaceStrong: '#F3EFE4',
  border: '#E2DDCD',
  borderSubtle: '#F3EFE4',
  borderStrong: '#ADA899',
  textNavy: '#1F3066',
  textBody: '#2C2F34',
  textSecondary: '#565D65',
  textMuted: '#828D96',
  // Status, as in the Aura globals.css
  good: '#277153',
  goodBg: '#DDEBE4',
  warning: '#B67F14',
  warningBg: '#FFF6E9',
  critical: '#D41C16',
  criticalBg: '#FFF5F3',
  info: '#1E7CA1',
} as const;

/** The owner's stack for all text (Task 16b); body and display are the same. */
export const DISPLAY_FONT = "Optima, Candara, 'Segoe UI', sans-serif";
export const BODY_FONT = DISPLAY_FONT;
/**
 * Code and machine identifiers only (SQL, markdown code, asset names, MCP
 * tokens), as --aura-font-mono; tailwind.config.cjs fontFamily.mono uses that variable.
 */
export const MONO_FONT = 'ui-monospace, Menlo, monospace';

// Light to dark around the Aura accent at index 6; 7 and 8 are its hover and
// pressed shades, 9 is navy.
const aura: MantineColorsTuple = [
  AURA.accentSubtle,
  '#DDE4F8',
  '#C0CDF0',
  '#A0B3E8',
  '#8299DF',
  '#6583E0',
  AURA.accent,
  AURA.accentHover,
  AURA.accentPressed,
  AURA.navy,
];

/** Control height for the default `xs` size (26–28px). */
const CONTROL_HEIGHT = '28px';
const isXs = (size: unknown) => size === undefined || size === 'xs';

const xs = { defaultProps: { size: 'xs' } } as const;

export const theme = createTheme({
  primaryColor: 'aura',
  primaryShade: 6,
  colors: { aura },
  black: AURA.textBody,
  fontFamily: BODY_FONT,
  fontFamilyMonospace: MONO_FONT,
  headings: { fontFamily: DISPLAY_FONT },
  fontSizes: { xs: '11px', sm: '12px', md: '13px', lg: '14px', xl: '16px' },
  defaultRadius: 'sm',
  radius: { xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '8px' },
  components: {
    Button: Button.extend({
      ...xs,
      vars: (_theme, props) => ({ root: isXs(props.size) ? { '--button-height': CONTROL_HEIGHT } : {} }),
    }),
    ActionIcon: ActionIcon.extend({
      ...xs,
      vars: (_theme, props) => ({ root: isXs(props.size) ? { '--ai-size': '26px' } : {} }),
    }),
    Input: Input.extend({
      vars: (_theme, props) => ({
        wrapper: isXs(props.size) ? { '--input-height': CONTROL_HEIGHT, '--input-fz': '12px' } : {},
      }),
    }),
    TextInput: TextInput.extend(xs),
    Textarea: Textarea.extend(xs),
    PasswordInput: PasswordInput.extend(xs),
    NumberInput: NumberInput.extend(xs),
    Select: Select.extend(xs),
    MultiSelect: MultiSelect.extend(xs),
    Autocomplete: Autocomplete.extend(xs),
    Checkbox: Checkbox.extend(xs),
    Switch: Switch.extend(xs),
    SegmentedControl: SegmentedControl.extend(xs),
    Badge: Badge.extend(xs),
    CloseButton: CloseButton.extend(xs),
  },
});

/** Aura tokens as CSS variables, for shell and page styles. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--aura-navy': AURA.navy,
    '--aura-accent': AURA.accent,
    '--aura-accent-hover': AURA.accentHover,
    '--aura-accent-pressed': AURA.accentPressed,
    '--aura-accent-subtle': AURA.accentSubtle,
    '--aura-canvas': AURA.canvas,
    '--aura-surface': AURA.surface,
    '--aura-surface-strong': AURA.surfaceStrong,
    '--aura-border': AURA.border,
    '--aura-border-subtle': AURA.borderSubtle,
    '--aura-border-strong': AURA.borderStrong,
    '--aura-text-navy': AURA.textNavy,
    '--aura-text-body': AURA.textBody,
    '--aura-text-secondary': AURA.textSecondary,
    '--aura-text-muted': AURA.textMuted,
    '--aura-good': AURA.good,
    '--aura-good-bg': AURA.goodBg,
    '--aura-warning': AURA.warning,
    '--aura-warning-bg': AURA.warningBg,
    '--aura-critical': AURA.critical,
    '--aura-critical-bg': AURA.criticalBg,
    '--aura-info': AURA.info,
    '--aura-font-display': DISPLAY_FONT,
    '--aura-font-mono': MONO_FONT,
  },
  light: {},
  dark: {},
});
