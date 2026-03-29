import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from './ConfirmDialog';

vi.mock('./ConfirmDialog.css', () => ({}));

const getDeleteBtn = () => screen.getByRole('button', { name: /DELETE|DELETING/i });

describe('ConfirmDialog', () => {
  let onClose, onConfirm;

  beforeEach(() => {
    onClose = vi.fn();
    onConfirm = vi.fn().mockResolvedValue(undefined);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Advance past the 400ms open-guard so confirm is allowed */
  const passOpenGuard = () => vi.advanceTimersByTime(500);

  // ── Rendering ──
  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <ConfirmDialog isOpen={false} onClose={onClose} onConfirm={onConfirm} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders custom title and message', () => {
      render(
        <ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} title="Delete Items" message="Gone forever." />
      );
      expect(screen.getByText('Delete Items')).toBeInTheDocument();
      expect(screen.getByText('Gone forever.')).toBeInTheDocument();
    });

    it('renders default title and message when not provided', () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
      expect(screen.getByText(/permanently deleted/)).toBeInTheDocument();
    });

    it('sets aria-label to title when provided', () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} title="Remove Run" />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Remove Run');
    });

    it('sets aria-label to fallback when no title', () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Confirm deletion');
    });

    it('does not show safeguard input by default', () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      expect(screen.queryByPlaceholderText('DELETE')).not.toBeInTheDocument();
    });
  });

  // ── Basic (no safeguard) ──
  describe('without safeguard', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      await user.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onConfirm and onClose when DELETE is clicked after guard', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      passOpenGuard();
      await user.click(getDeleteBtn());
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking the overlay (outside the card)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      await user.click(screen.getByRole('dialog'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking inside the card', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      await user.click(screen.getByText('Confirm Deletion'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ── 400ms open guard ──
  describe('400ms open guard', () => {
    it('blocks confirm when clicked immediately after opening', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      // Click immediately — guard should block
      await user.click(getDeleteBtn());
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('allows confirm after 400ms have passed', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      passOpenGuard();
      await user.click(getDeleteBtn());
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  // ── Error handling ──
  describe('error handling', () => {
    it('still closes dialog when onConfirm throws', async () => {
      onConfirm.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      passOpenGuard();
      await user.click(getDeleteBtn());
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ── Focus management ──
  describe('focus management', () => {
    it('focuses cancel button when opened without safeguard', async () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
      await act(() => vi.advanceTimersByTime(150));
      expect(document.activeElement).toBe(screen.getByText('Cancel'));
    });

    it('focuses safeguard input when opened with safeguard', async () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      await act(() => vi.advanceTimersByTime(150));
      expect(document.activeElement).toBe(screen.getByPlaceholderText('DELETE'));
    });
  });

  // ── Reopen reset ──
  describe('reopen behavior', () => {
    it('resets safeguard input when dialog reopens', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { rerender } = render(
        <ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />
      );
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'DEL');
      expect(input).toHaveValue('DEL');

      // Close then reopen
      rerender(<ConfirmDialog isOpen={false} onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      rerender(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);

      expect(screen.getByPlaceholderText('DELETE')).toHaveValue('');
    });
  });

  // ── Safeguard mode ──
  describe('with requireSafeguard', () => {
    it('shows the safeguard input and label', () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument();
      expect(screen.getByText(/Type/)).toBeInTheDocument();
      expect(screen.getByText('DELETE', { selector: 'strong' })).toBeInTheDocument();
    });

    it('DELETE button is disabled initially', () => {
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      expect(getDeleteBtn()).toBeDisabled();
    });

    it('rejects lowercase input — field stays empty', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'delete');
      expect(input).toHaveValue('');
      expect(getDeleteBtn()).toBeDisabled();
    });

    it('rejects mixed case — only uppercase chars accepted', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'DeLeTe');
      expect(input).toHaveValue('DLT');
      expect(getDeleteBtn()).toBeDisabled();
    });

    it('rejects numbers and special characters', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'D3L!TE');
      expect(input).toHaveValue('DLTE');
    });

    it('rejects spaces', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'D E L');
      expect(input).toHaveValue('DEL');
    });

    it('accepts uppercase DELETE and enables button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'DELETE');
      expect(input).toHaveValue('DELETE');
      expect(getDeleteBtn()).toBeEnabled();
    });

    it('disables button again when text is cleared after typing DELETE', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'DELETE');
      expect(getDeleteBtn()).toBeEnabled();
      await user.clear(input);
      expect(getDeleteBtn()).toBeDisabled();
    });

    it('calls onConfirm after typing DELETE and clicking button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      passOpenGuard();
      await user.type(screen.getByPlaceholderText('DELETE'), 'DELETE');
      await user.click(getDeleteBtn());
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('does not call onConfirm with partial text', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      passOpenGuard();
      await user.type(screen.getByPlaceholderText('DELETE'), 'DEL');
      await user.click(getDeleteBtn());
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('confirms via Enter key after typing DELETE', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      passOpenGuard();
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'DELETE');
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1);
      });
    });

    it('Enter key does nothing with incomplete text', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      passOpenGuard();
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'DEL');
      await user.keyboard('{Enter}');
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not accept wrong uppercase word', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} requireSafeguard />);
      const input = screen.getByPlaceholderText('DELETE');
      await user.type(input, 'REMOVE');
      expect(input).toHaveValue('REMOVE');
      expect(getDeleteBtn()).toBeDisabled();
    });
  });
});
