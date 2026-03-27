import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusViewer from '../chat-ui/components/StatusViewer.jsx';

describe('StatusViewer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not close when the user interacts with the reply input and sends replies explicitly', () => {
    const onClose = vi.fn();
    const onReply = vi.fn();

    render(
      <StatusViewer
        status={{
          contact: { name: 'Alice QA', avatar: '🦊' },
          time: 'Just now',
          text: 'Hello',
        }}
        onClose={onClose}
        onReply={onReply}
      />,
    );

    fireEvent.click(screen.getByTestId('status-reply-input'));
    fireEvent.change(screen.getByTestId('status-reply-input'), { target: { value: 'Reply back' } });

    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('status-reply-send'));

    expect(onReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello' }),
      'Reply back',
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
