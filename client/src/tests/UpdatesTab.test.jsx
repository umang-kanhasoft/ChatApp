import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UpdatesTab from '../chat-ui/components/UpdatesTab.jsx';

describe('UpdatesTab', () => {
  it('opens the status composer from my status and views statuses', () => {
    const onAddStatus = vi.fn();
    const onViewStatus = vi.fn();

    render(
      <UpdatesTab
        currentUser={{ avatar: '🦊' }}
        statuses={[
          {
            id: 'status-1',
            viewed: false,
            contact: { name: 'Bob QA', avatar: '🐼' },
            time: 'Just now',
          },
        ]}
        onAddStatus={onAddStatus}
        onViewStatus={onViewStatus}
      />,
    );

    fireEvent.click(screen.getByTestId('my-status-button'));
    fireEvent.click(screen.getByTestId('status-item-status-1'));

    expect(onAddStatus).toHaveBeenCalledTimes(1);
    expect(onViewStatus).toHaveBeenCalledTimes(1);
  });
});
