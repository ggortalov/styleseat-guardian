import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateRangePicker from './DateRangePicker';

function renderPicker(props = {}) {
  const defaults = { startDate: null, endDate: null, onChange: vi.fn() };
  const merged = { ...defaults, ...props };
  return { ...render(<DateRangePicker {...merged} />), onChange: merged.onChange };
}

describe('DateRangePicker', () => {
  // ── Display ──

  it('shows "All dates" when no dates selected', () => {
    renderPicker();
    expect(screen.getByText('All dates')).toBeInTheDocument();
  });

  it('shows formatted range when both dates provided', () => {
    renderPicker({
      startDate: new Date(2026, 2, 10),  // Mar 10
      endDate: new Date(2026, 2, 15),    // Mar 15
    });
    // Format: "Mar 10 – Mar 15"
    expect(screen.getByText(/Mar 10/)).toBeInTheDocument();
    expect(screen.getByText(/Mar 15/)).toBeInTheDocument();
  });

  // ── Open / Close ──

  it('opens calendar on button click', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('button', { name: /all dates/i }).closest('button') || screen.getByText('All dates').closest('button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderPicker();
    // Open
    const trigger = screen.getByText('All dates').closest('button');
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Escape
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ── Clear ──

  it('clear button calls onChange with null, null', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({
      startDate: new Date(2026, 2, 10),
      endDate: new Date(2026, 2, 15),
    });
    const trigger = screen.getByText(/Mar 10/).closest('button');
    await user.click(trigger);
    await user.click(screen.getByText('Clear'));
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  // ── Two-click selection ──

  it('two clicks set a date range', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    const trigger = screen.getByText('All dates').closest('button');
    await user.click(trigger);

    // Get all day buttons in the grid
    const dialog = screen.getByRole('dialog');
    const dayButtons = within(dialog).getAllByRole('button').filter(
      btn => btn.classList.contains('drp-day') && !btn.classList.contains('drp-day--outside')
    );

    // Click two different days
    await user.click(dayButtons[4]);  // ~5th day of month
    // After first click, hint should appear
    expect(screen.getByText('Select end date')).toBeInTheDocument();
    await user.click(dayButtons[9]);  // ~10th day of month

    expect(onChange).toHaveBeenCalledTimes(1);
    const [start, end] = onChange.mock.calls[0];
    expect(start.getDate()).toBeLessThanOrEqual(end.getDate());
  });

  it('auto-swaps dates when end < start', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    const trigger = screen.getByText('All dates').closest('button');
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    const dayButtons = within(dialog).getAllByRole('button').filter(
      btn => btn.classList.contains('drp-day') && !btn.classList.contains('drp-day--outside')
    );

    // Click later day first, then earlier day
    await user.click(dayButtons[14]); // ~15th
    await user.click(dayButtons[4]);  // ~5th

    expect(onChange).toHaveBeenCalledTimes(1);
    const [start, end] = onChange.mock.calls[0];
    expect(start <= end).toBe(true);
  });

  it('shows "Select end date" hint after first click', async () => {
    const user = userEvent.setup();
    renderPicker();
    const trigger = screen.getByText('All dates').closest('button');
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    const dayButtons = within(dialog).getAllByRole('button').filter(
      btn => btn.classList.contains('drp-day') && !btn.classList.contains('drp-day--outside')
    );

    await user.click(dayButtons[2]);
    expect(screen.getByText('Select end date')).toBeInTheDocument();
  });
});
