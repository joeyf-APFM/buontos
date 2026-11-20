/**
 * Contract tests for the primitives in components/ui (form controls and
 * display parts): the same exported API as the shadcn originals, with Mantine
 * behind it.
 */
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { renderWithMantine, userEvent } from '@/test/utils';
import { AppMantineProvider } from '@/mantine/provider';
import { Button, type ButtonProps } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { Label } from './label';
import { Checkbox } from './checkbox';
import { Switch } from './switch';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form';
import { Badge, type BadgeProps } from './badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Separator } from './separator';
import { Skeleton } from './skeleton';
import { Progress } from './progress';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

const buttonHeight = (el: HTMLElement) =>
  getComputedStyle(el).getPropertyValue('--button-height') || el.style.getPropertyValue('--button-height');

describe('Button', () => {
  const variants: [NonNullable<ButtonProps['variant']>, string][] = [
    ['default', 'filled'],
    ['destructive', 'filled'],
    ['outline', 'default'],
    ['secondary', 'light'],
    ['ghost', 'subtle'],
    ['link', 'transparent'],
  ];
  const sizes: [NonNullable<ButtonProps['size']>, string][] = [
    ['default', '28px'],
    ['sm', '26px'],
    ['lg', '32px'],
    ['icon', '28px'],
  ];

  it('button renders each variant and size with the documented height', () => {
    for (const [variant, mantineVariant] of variants) {
      for (const [size, height] of sizes) {
        const { unmount } = renderWithMantine(
          <Button variant={variant} size={size}>
            Go
          </Button>,
        );
        const button = screen.getByRole('button', { name: 'Go' });
        expect(button).toHaveAttribute('data-variant', mantineVariant);
        expect(buttonHeight(button)).toBe(height);
        unmount();
      }
    }
  });

  it('button keeps caller classes, the ref and submits a form by default', async () => {
    const user = userEvent.setup();
    const ref = { current: null as HTMLButtonElement | null };
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    renderWithMantine(
      <form onSubmit={onSubmit}>
        <Button ref={ref} className="w-full mt-2">
          Save
        </Button>
        <Button type="button">Cancel</Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('w-full', 'mt-2');
    expect(ref.current).toBe(button);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('button asChild renders the child element with button styling', async () => {
    const user = userEvent.setup();
    render(
      <AppMantineProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <Button asChild variant="outline" className="ml-2">
                  <Link to="/next" className="child-class">
                    Next page
                  </Link>
                </Button>
              }
            />
            <Route path="/next" element={<p>Arrived</p>} />
          </Routes>
        </MemoryRouter>
      </AppMantineProvider>,
    );
    const link = screen.getByRole('link', { name: 'Next page' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/next');
    expect(link).not.toHaveAttribute('type');
    expect(link).toHaveAttribute('data-variant', 'default');
    expect(link).toHaveClass('ml-2', 'child-class');
    expect(screen.queryByRole('button')).toBeNull();

    await user.tab();
    expect(link).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Arrived')).toBeInTheDocument();
  });

  it('button passes the root gap and justify-content to its inner and label spans', () => {
    renderWithMantine(
      <Button className="gap-3 justify-start" style={{ gap: '12px' }}>
        <svg data-testid="icon" />
        Create
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Create' });
    const label = screen.getByTestId('icon').parentElement as HTMLElement;
    const inner = label.parentElement as HTMLElement;
    expect(inner.parentElement).toBe(button);
    for (const span of [inner, label]) {
      expect(span.style.gap).toBe('inherit');
      expect(span.style.justifyContent).toBe('inherit');
    }
    // Content may overflow the label, as it overflowed the shadcn button
    expect(label.style.overflow).toBe('visible');
    expect(button).toHaveClass('gap-3', 'justify-start');
  });

  it('button disabled and loading keep the native disabled attribute', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithMantine(
      <>
        <Button disabled onClick={onClick}>
          Off
        </Button>
        <Button loading onClick={onClick}>
          Busy
        </Button>
      </>,
    );
    const off = screen.getByRole('button', { name: 'Off' });
    const busy = screen.getByRole('button', { name: 'Busy' });
    expect(off).toBeDisabled();
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('data-loading');
    await user.click(off);
    expect(onClick).not.toHaveBeenCalled();
  });
});

type NameForm = { name: string };

function NameField({ withError }: { withError: boolean }) {
  const form = useForm<NameForm>({ defaultValues: { name: '' } });
  useEffect(() => {
    if (withError) form.setError('name', { message: 'Name is required' });
  }, [form, withError]);
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="Your name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}

describe('Input and Textarea', () => {
  it('input with a form error keeps aria-describedby and the message', async () => {
    renderWithMantine(<NameField withError />);
    const message = await screen.findByText('Name is required');
    const input = screen.getByLabelText('Name');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('name', 'name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
  });

  it('input without an error is described but not invalid, and types', async () => {
    const user = userEvent.setup();
    renderWithMantine(<NameField withError={false} />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).toHaveAttribute('aria-describedby');
    await user.type(input, 'Ada');
    expect(input).toHaveValue('Ada');
  });

  it('input keeps disabled, type, ref and routes layout classes to the root', () => {
    const ref = { current: null as HTMLInputElement | null };
    renderWithMantine(
      <Input ref={ref} type="number" disabled aria-label="Count" className="mt-1 w-32 h-8 pl-8 font-mono" />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Count' });
    expect(ref.current).toBe(input);
    expect(input).toBeDisabled();
    expect(input).toHaveClass('h-8', 'pl-8', 'font-mono');
    expect(input).not.toHaveClass('mt-1');
    expect(input.parentElement).toHaveClass('mt-1', 'w-32');
    expect(input.parentElement).not.toHaveClass('w-full');
  });

  it('textarea forwards rows, the ref and the value', async () => {
    const user = userEvent.setup();
    const ref = { current: null as HTMLTextAreaElement | null };
    renderWithMantine(<Textarea ref={ref} rows={4} aria-label="Notes" className="mt-1 resize-none" />);
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    expect(ref.current).toBe(textarea);
    expect(textarea).toHaveAttribute('rows', '4');
    expect(textarea).toHaveClass('resize-none');
    expect(textarea.parentElement).toHaveClass('mt-1');
    // The shadcn w-full baseline, which a caller's width class replaces
    expect(textarea.parentElement).toHaveClass('w-full');
    await user.type(textarea, 'hello');
    expect(textarea).toHaveValue('hello');
  });
});

function Labelled({ htmlFor, children, label }: { htmlFor: string; children: ReactNode; label: string }) {
  return (
    <div>
      {children}
      <Label htmlFor={htmlFor}>{label}</Label>
    </div>
  );
}

describe('Checkbox, Switch and RadioGroup', () => {
  it('checkbox and switch toggle and call onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckbox = vi.fn();
    const onSwitch = vi.fn();
    renderWithMantine(
      <>
        <Labelled htmlFor="agree" label="Agree">
          <Checkbox id="agree" checked={false} onCheckedChange={onCheckbox} />
        </Labelled>
        <Labelled htmlFor="notify" label="Notify">
          <Switch id="notify" checked onCheckedChange={onSwitch} />
        </Labelled>
      </>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Agree' });
    const toggle = screen.getByRole('switch', { name: 'Notify' });
    expect(checkbox).not.toBeChecked();
    expect(toggle).toBeChecked();

    await user.click(checkbox);
    expect(onCheckbox).toHaveBeenCalledWith(true);
    await user.click(screen.getByText('Notify'));
    expect(onSwitch).toHaveBeenCalledWith(false);
  });

  it('checkbox shows the indeterminate state and checks from it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(<Checkbox aria-label="All rows" checked="indeterminate" onCheckedChange={onChange} />);
    const checkbox = screen.getByRole('checkbox', { name: 'All rows' }) as HTMLInputElement;
    expect(checkbox.indeterminate).toBe(true);
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('uncontrolled checkbox and switch toggle themselves', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <>
        <Checkbox aria-label="Remember" defaultChecked />
        <Switch aria-label="Dark" />
      </>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Remember' });
    const toggle = screen.getByRole('switch', { name: 'Dark' });
    await user.click(checkbox);
    await user.click(toggle);
    expect(checkbox).not.toBeChecked();
    expect(toggle).toBeChecked();
  });

  it('radio-group selects by value and fires onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithMantine(
      <RadioGroup value="a" onValueChange={onValueChange} className="grid grid-cols-2">
        <Labelled htmlFor="opt-a" label="Option A">
          <RadioGroupItem id="opt-a" value="a" />
        </Labelled>
        <Labelled htmlFor="opt-b" label="Option B">
          <RadioGroupItem id="opt-b" value="b" />
        </Labelled>
      </RadioGroup>,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const a = screen.getByRole('radio', { name: 'Option A' });
    const b = screen.getByRole('radio', { name: 'Option B' });
    expect(a).toBeChecked();
    expect(b).not.toBeChecked();
    await user.click(b);
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('a disabled radio item stays disabled in an enabled group', () => {
    renderWithMantine(
      <RadioGroup value="a" onValueChange={() => {}}>
        <RadioGroupItem aria-label="A" value="a" />
        <RadioGroupItem aria-label="B" value="b" disabled />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'A' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'B' })).toBeDisabled();
  });

  it('a radio group puts id and aria attributes on the radiogroup element', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithMantine(
      <>
        <p id="help">Pick one</p>
        <RadioGroup ref={ref} id="choice" aria-describedby="help" aria-invalid={false} aria-label="Choice" className="flex gap-4">
          <RadioGroupItem aria-label="A" value="a" />
        </RadioGroup>
      </>,
    );
    const group = screen.getByRole('radiogroup', { name: 'Choice' });
    expect(ref.current).toBe(group);
    expect(group).toHaveAttribute('id', 'choice');
    expect(group).toHaveAttribute('aria-describedby', 'help');
    expect(group).toHaveAttribute('aria-invalid', 'false');
    expect(group).toHaveAccessibleDescription('Pick one');
    expect(screen.getByRole('radio', { name: 'A' }).closest('.flex')).toHaveClass('gap-4');
  });
});

describe('Enter on checkbox, radio and switch', () => {
  function InForm({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <button type="submit">Submit</button>
      </form>
    );
  }

  it('Enter on a checkbox or radio is prevented and does not submit the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onKeyDown = vi.fn();
    const onCheckedChange = vi.fn();
    renderWithMantine(
      <InForm onSubmit={onSubmit}>
        <Checkbox aria-label="Agree" onKeyDown={onKeyDown} onCheckedChange={onCheckedChange} />
        <RadioGroup value="a" onValueChange={() => {}}>
          <RadioGroupItem aria-label="A" value="a" onKeyDown={onKeyDown} />
        </RadioGroup>
      </InForm>,
    );
    for (const control of [screen.getByRole('checkbox', { name: 'Agree' }), screen.getByRole('radio', { name: 'A' })]) {
      // fireEvent returns false when the default was prevented
      expect(fireEvent.keyDown(control, { key: 'Enter' })).toBe(false);
      control.focus();
      await user.keyboard('{Enter}');
    }
    expect(onKeyDown).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('a submit button in the same form still submits (the check above is live)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(
      <InForm onSubmit={onSubmit}>
        <input aria-label="Plain" type="checkbox" />
      </InForm>,
    );
    screen.getByRole('checkbox', { name: 'Plain' }).focus();
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Enter toggles a switch and calls onCheckedChange without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCheckedChange = vi.fn();
    renderWithMantine(
      <InForm onSubmit={onSubmit}>
        <Switch aria-label="Notify" onCheckedChange={onCheckedChange} />
      </InForm>,
    );
    const toggle = screen.getByRole('switch', { name: 'Notify' });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    await user.keyboard('{Enter}');
    expect(toggle).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

const cssVar = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);

describe('Badge', () => {
  it('badge variants map to Mantine variants at 18px and 11px', () => {
    const variants: [NonNullable<BadgeProps['variant']>, string][] = [
      ['default', 'filled'],
      ['secondary', 'light'],
      ['destructive', 'filled'],
      ['outline', 'outline'],
      ['info', 'light'],
    ];
    for (const [variant, mantineVariant] of variants) {
      const { unmount } = renderWithMantine(<Badge variant={variant}>{variant}</Badge>);
      const badge = screen.getByText(variant).closest('.mantine-Badge-root') as HTMLElement;
      expect(badge).toHaveAttribute('data-variant', mantineVariant);
      expect(cssVar(badge, '--badge-height')).toBe('18px');
      expect(cssVar(badge, '--badge-fz')).toBe('11px');
      unmount();
    }
  });

  it('badge colours: accent by default, gray secondary, critical destructive', () => {
    renderWithMantine(
      <>
        <Badge>Accent</Badge>
        <Badge variant="secondary">Gray</Badge>
        <Badge variant="destructive">Critical</Badge>
      </>,
    );
    const root = (text: string) => screen.getByText(text).closest('.mantine-Badge-root') as HTMLElement;
    expect(cssVar(root('Accent'), '--badge-bg')).toContain('aura');
    expect(cssVar(root('Gray'), '--badge-bg')).toContain('gray');
    expect(cssVar(root('Critical'), '--badge-bg').toUpperCase()).toBe('#D41C16');
  });

  it('badge renders a div with the ref, caller classes and props, keeping case and the children gap', () => {
    const ref = { current: null as HTMLDivElement | null };
    const onClick = vi.fn();
    renderWithMantine(
      <Badge ref={ref} className="gap-1 cursor-pointer" title="Status" onClick={onClick}>
        <svg data-testid="dot" />
        Active
      </Badge>,
    );
    const badge = screen.getByTitle('Status');
    expect(badge.tagName).toBe('DIV');
    expect(ref.current).toBe(badge);
    expect(badge).toHaveClass('gap-1', 'cursor-pointer', 'normal-case');
    // The children sit in Mantine's label span, which takes the root's gap
    const label = screen.getByTestId('dot').parentElement as HTMLElement;
    expect(label.style.gap).toBe('inherit');
    badge.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('badge grows with its text from an 18px minimum and wraps unless the caller truncates', () => {
    renderWithMantine(
      <>
        <Badge className="text-sm px-3 py-1">Running on a long estate name</Badge>
        <Badge className="truncate max-w-24">Truncated</Badge>
      </>,
    );
    const root = (text: string) => screen.getByText(text).closest('.mantine-Badge-root') as HTMLElement;
    const wrapping = root('Running on a long estate name');
    expect(wrapping).toHaveClass('h-auto', 'min-h-[18px]', 'text-sm', 'py-1');
    // The label takes white-space and text-overflow from the root, so it wraps
    // by default, without Mantine's nowrap and ellipsis
    const label = screen.getByText('Running on a long estate name');
    expect(label.style.whiteSpace).toBe('inherit');
    expect(label.style.textOverflow).toBe('inherit');
    expect(label.style.overflow).toBe('visible');
    expect(root('Truncated')).toHaveClass('truncate', 'max-w-24');
  });
});

describe('Card', () => {
  it('card renders as a bordered pane without shadow', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithMantine(
      <Card ref={ref} data-testid="card" className="mt-2">
        <CardHeader data-testid="header">
          <CardTitle>Owners</CardTitle>
          <CardDescription>People who own it</CardDescription>
        </CardHeader>
        <CardContent data-testid="content">Body</CardContent>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(ref.current).toBe(card);
    expect(card).toHaveAttribute('data-with-border');
    expect(card).toHaveClass('[--paper-border-color:var(--aura-border)]');
    // The theme's md radius is 6px
    expect(cssVar(card, '--paper-radius')).toBe('var(--mantine-radius-md)');
    expect(cssVar(card, '--paper-shadow')).toBe('');
    expect(card.className).not.toMatch(/(^|\s)shadow/);
    expect(card).toHaveClass('mt-2');
    // 12px padding in the parts
    expect(screen.getByTestId('header')).toHaveClass('p-3');
    expect(screen.getByTestId('content')).toHaveClass('p-3', 'pt-0');
    expect(screen.getByTestId('footer')).toHaveClass('p-3', 'pt-0');
    // Title: 13px semibold navy
    expect(screen.getByText('Owners')).toHaveClass(
      'text-[13px]',
      'font-semibold',
      'text-[color:var(--aura-text-navy)]',
    );
  });

  it('card parts let caller classes win', () => {
    renderWithMantine(
      <Card data-testid="card" className="border-0 rounded-none">
        <CardTitle className="text-lg">Big</CardTitle>
        <CardContent data-testid="content" className="p-0">Body</CardContent>
      </Card>,
    );
    expect(screen.getByTestId('card')).toHaveClass('border-0', 'rounded-none');
    expect(screen.getByText('Big')).toHaveClass('text-lg');
    expect(screen.getByText('Big')).not.toHaveClass('text-[13px]');
    expect(screen.getByTestId('content')).toHaveClass('p-0');
    expect(screen.getByTestId('content')).not.toHaveClass('p-3');
  });
});

describe('Alert', () => {
  it('alert destructive uses role alert and the critical colour', () => {
    renderWithMantine(
      <>
        <Alert variant="destructive" className="mb-2">
          <svg data-testid="icon" />
          <AlertTitle>Failed</AlertTitle>
          <AlertDescription>Could not save</AlertDescription>
        </Alert>
        <Alert>
          <AlertDescription>Saved</AlertDescription>
        </Alert>
      </>,
    );
    const [destructive, plain] = screen.getAllByRole('alert');
    expect(destructive).toHaveTextContent('FailedCould not save');
    expect(destructive).toHaveClass(
      'mb-2',
      'text-[color:var(--aura-critical)]',
      'border-[color:var(--aura-critical)]',
      'bg-[color:var(--aura-critical-bg)]',
    );
    expect(plain.className).not.toContain('--aura-critical');
    expect(screen.getByText('Failed').tagName).toBe('H5');
    // The icon stays a direct child, where the alert positions it
    expect(screen.getByTestId('icon').parentElement).toBe(destructive);
  });
});

describe('Table', () => {
  it('table parts render a table with 28px rows', () => {
    const ref = { current: null as HTMLTableElement | null };
    renderWithMantine(
      <Table ref={ref} className="min-w-full">
        <TableCaption>Assets</TableCaption>
        <TableHeader data-testid="thead">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>orders</TableCell>
            <TableCell>table</TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={2}>No more rows</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>2 assets</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
    const table = screen.getByRole('table', { name: 'Assets' });
    expect(ref.current).toBe(table);
    expect(table).toHaveClass('min-w-full');
    expect(screen.getAllByRole('rowgroup')).toHaveLength(3);
    expect(screen.getAllByRole('row')).toHaveLength(4);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Name', 'Type']);
    for (const header of headers) expect(header).toHaveClass('h-7');
    expect(screen.getByTestId('thead')).toHaveClass('bg-[color:var(--aura-surface-strong)]');
    for (const cell of screen.getAllByRole('cell')) expect(cell).toHaveClass('h-7');
    expect(screen.getByRole('cell', { name: 'No more rows' })).toHaveAttribute('colspan', '2');
  });
});

describe('Skeleton, Progress, Separator and Avatar', () => {
  it('skeleton and progress render with aria attributes', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithMantine(
      <>
        <Skeleton data-testid="skeleton" aria-label="Loading owners" className="h-4 w-24" />
        <Progress ref={ref} value={40} aria-label="Import" className="h-2 flex-1" data-testid="progress" />
        <Progress value={3} max={4} aria-label="Steps" />
      </>,
    );
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveAttribute('aria-label', 'Loading owners');
    expect(skeleton).toHaveAttribute('data-animate');
    expect(skeleton).toHaveClass('h-4', 'w-24');

    const bar = screen.getByRole('progressbar', { name: 'Import' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    // The ref and the caller's classes are on the track around the bar
    expect(ref.current).toBe(screen.getByTestId('progress'));
    expect(ref.current).toContainElement(bar);
    expect(ref.current).toHaveClass('h-2', 'flex-1');
    expect(screen.getByRole('progressbar', { name: 'Steps' })).toHaveAttribute('aria-valuenow', '75');
  });

  it('separator is decorative by default and a separator when it is not', () => {
    renderWithMantine(
      <>
        <Separator data-testid="decorative" className="my-4" />
        <Separator decorative={false} orientation="vertical" />
      </>,
    );
    expect(screen.getByTestId('decorative')).toHaveAttribute('role', 'none');
    expect(screen.getByTestId('decorative')).toHaveClass('my-4');
    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
  });

  it('separators span their flex parent: full width, or full height when vertical', () => {
    renderWithMantine(
      <div className="flex">
        <Separator data-testid="horizontal" />
        <Separator data-testid="vertical" orientation="vertical" />
        <Separator data-testid="narrow" className="w-8" />
      </div>,
    );
    expect(screen.getByTestId('horizontal')).toHaveClass('w-full', 'shrink-0');
    expect(screen.getByTestId('horizontal')).not.toHaveClass('h-full');
    expect(screen.getByTestId('vertical')).toHaveClass('h-full', 'shrink-0');
    expect(screen.getByTestId('vertical')).not.toHaveClass('w-full');
    expect(screen.getByTestId('narrow')).toHaveClass('w-8');
    expect(screen.getByTestId('narrow')).not.toHaveClass('w-full');
  });

  it('avatar is sized by the caller classes, without Mantine\'s 38px min-width', () => {
    renderWithMantine(
      <Avatar data-testid="small" className="h-5 w-5">
        <AvatarFallback>J</AvatarFallback>
      </Avatar>,
    );
    const avatar = screen.getByTestId('small');
    expect(avatar).toHaveClass('h-5', 'w-5', 'min-w-0', 'rounded-full');
    expect(avatar).not.toHaveClass('h-10', 'w-10');
    // The fallback fills it and stays a circle
    expect(screen.getByText('J')).toHaveClass('h-full', 'w-full', 'rounded-full');
  });

  it('avatar shows its fallback without an image', () => {
    renderWithMantine(
      <Avatar data-testid="avatar" className="h-8 w-8">
        <AvatarFallback className="text-xs">JF</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByTestId('avatar')).toHaveClass('h-8', 'w-8');
    expect(screen.getByText('JF')).toHaveClass('text-xs');
  });

  it('avatar swaps the fallback for the image once it loads', async () => {
    class LoadingImage {
      onload: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadingImage);
    try {
      renderWithMantine(
        <Avatar>
          <AvatarImage src="/me.png" alt="Joey" />
          <AvatarFallback>JF</AvatarFallback>
        </Avatar>,
      );
      expect(screen.getByText('JF')).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();
      expect(await screen.findByRole('img', { name: 'Joey' })).toHaveAttribute('src', '/me.png');
      expect(screen.queryByText('JF')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
