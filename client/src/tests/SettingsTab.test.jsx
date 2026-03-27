import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsTab from '../chat-ui/components/SettingsTab.jsx';

describe('SettingsTab', () => {
  it('offers an explicit logout action', () => {
    const onLogout = vi.fn();

    render(<SettingsTab currentUser={{ name: 'Alice QA' }} onLogout={onLogout} />);

    fireEvent.click(screen.getByTestId('logout-button'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
