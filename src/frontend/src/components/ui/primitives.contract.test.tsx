/**
 * Contract tests for the form-control primitives in components/ui: the same
 * exported API as the shadcn originals, with Mantine behind it.
 */
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
