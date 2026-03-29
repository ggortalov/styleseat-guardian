import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuiteDropdown from './SuiteDropdown';

// jsdom does not implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const SUITES = ['P0', 'P1', 'P1 Devices', 'Smoke'];

function renderDropdown(props = {}) {
  const defaults = { value: '', options: SUITES, onChange: vi.fn() };
  const merged = { ...defaults, ...props };
  return { ...render(<SuiteDropdown {...merged} />), onChange: merged.onChange };
}

describe('SuiteDropdown', () => {
  // ── Display ──

  it('shows "All Suites" when value is empty', () => {
    renderDropdown({ value: '' });
    expect(screen.getByText('All Suites')).toBeInTheDocument();
  });

  it('shows suite name when value is set', () => {
    renderDropdown({ value: 'P1' });
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  // ── Open / Close ──

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole('button', { name: /filter by suite/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole('button', { name: /filter by suite/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // ── Selection ──

  it('"All Suites" option calls onChange with empty string', async () => {
    const user = userEvent.setup();
    const { onChange } = renderDropdown({ value: 'P0' });
    await user.click(screen.getByRole('button', { name: /filter by suite/i }));
    await user.click(screen.getByText('All Suites'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clicking a suite calls onChange with suite name', async () => {
    const user = userEvent.setup();
    const { onChange } = renderDropdown();
    await user.click(screen.getByRole('button', { name: /filter by suite/i }));
    // Find the option with role="option" containing "Smoke"
    const options = screen.getAllByRole('option');
    const smokeOption = options.find(o => o.textContent.includes('Smoke'));
    await user.click(smokeOption);
    expect(onChange).toHaveBeenCalledWith('Smoke');
  });

  // ── Search ──

  it('search filters case-insensitively', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole('button', { name: /filter by suite/i }));
    await user.type(screen.getByPlaceholderText('Search suites...'), 'p1');
    const options = screen.getAllByRole('option');
    // "All Suites" + P1 + P1 Devices = 3
    const labels = options.map(o => o.textContent);
    expect(labels.some(l => l.includes('P1'))).toBe(true);
    expect(labels.some(l => l.includes('Smoke'))).toBe(false);
  });

  it('shows no-match message for empty search results', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole('button', { name: /filter by suite/i }));
    await user.type(screen.getByPlaceholderText('Search suites...'), 'zzz_nonexistent');
    expect(screen.getByText(/no suites match/i)).toBeInTheDocument();
  });

  // ── Keyboard navigation ──

  it('ArrowDown + Enter selects an option', async () => {
    const user = userEvent.setup();
    const { onChange } = renderDropdown();
    // Open
    await user.click(screen.getByRole('button', { name: /filter by suite/i }));
    // ArrowDown once → focus "All Suites" (index 0), ArrowDown again → first suite
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('P0');
  });
});
