import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatScreen from '../chat-ui/components/ChatScreen.jsx';

const baseChat = {
  id: 'conversation-1',
  name: 'Bob QA',
  avatar: '🐼',
  online: true,
  isGroup: false,
};

const baseMessages = [
  {
    id: 'message-1',
    rawId: 'message-1',
    sender: 'me',
    text: 'Hello Bob',
    time: '10:30',
    status: 'sent',
    type: 'text',
  },
];

describe('ChatScreen', () => {
  it('sends messages and opens the reaction context menu', async () => {
    const onSendMessage = vi.fn();
    const onReactMessage = vi.fn();

    render(
      <ChatScreen
        chat={baseChat}
        messages={baseMessages}
        onBack={vi.fn()}
        onOpenContactInfo={vi.fn()}
        onSendMessage={onSendMessage}
        onStartCall={vi.fn()}
        onTypingStart={vi.fn()}
        onTypingStop={vi.fn()}
        onEditMessage={vi.fn()}
        onDeleteMessage={vi.fn()}
        onForwardMessage={vi.fn()}
        onStarMessage={vi.fn()}
        onPinMessage={vi.fn()}
        onReactMessage={onReactMessage}
        onEmojiClick={vi.fn()}
        onMicClick={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'New message' } });
    fireEvent.click(screen.getByTestId('message-send-button'));

    expect(onSendMessage).toHaveBeenCalledWith('New message', null);

    fireEvent.contextMenu(screen.getByTestId('message-row-message-1'));
    await screen.findByTestId('message-context-menu');
    expect(screen.getByTestId('selected-message-header')).toBeInTheDocument();
    fireEvent.click(screen.getByText('👍'));

    expect(onReactMessage).toHaveBeenCalledWith('message-1', '👍');
  });

  it('swipes a message to reply and exposes header actions while selected', async () => {
    render(
      <ChatScreen
        chat={baseChat}
        messages={[
          ...baseMessages,
          {
            id: 'message-2',
            rawId: 'message-2',
            sender: 'them',
            text: 'Second message',
            time: '10:31',
            status: 'delivered',
            type: 'text',
          },
        ]}
        onBack={vi.fn()}
        onOpenContactInfo={vi.fn()}
        onSendMessage={vi.fn()}
        onStartCall={vi.fn()}
        onTypingStart={vi.fn()}
        onTypingStop={vi.fn()}
        onEditMessage={vi.fn()}
        onDeleteMessage={vi.fn()}
        onForwardMessage={vi.fn()}
        onStarMessage={vi.fn()}
        onPinMessage={vi.fn()}
        onReactMessage={vi.fn()}
        onEmojiClick={vi.fn()}
        onMicClick={vi.fn()}
      />,
    );

    const messageRow = screen.getByTestId('message-row-message-1');
    fireEvent.mouseDown(messageRow, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(messageRow, { clientX: 140, clientY: 14 });
    fireEvent.mouseUp(messageRow, { clientX: 140, clientY: 14 });

    expect(screen.queryByText('Editing Message')).not.toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getAllByText('Hello Bob').length).toBeGreaterThan(1);

    fireEvent.contextMenu(messageRow);
    await screen.findByTestId('selected-message-header');
    fireEvent.click(screen.getByTestId('message-row-message-2'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.queryByTestId('message-context-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-bubble-message-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('message-bubble-message-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByTestId('message-action-reply')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-action-pin')).toBeInTheDocument();
    expect(screen.getByTestId('message-action-delete')).toBeInTheDocument();
  });

  it('opens image messages fullscreen and renders reaction chips inline', async () => {
    const onReactMessage = vi.fn();

    render(
      <ChatScreen
        chat={baseChat}
        messages={[
          {
            id: 'image-message-1',
            rawId: 'image-message-1',
            sender: 'them',
            text: '',
            time: '10:31',
            status: 'delivered',
            type: 'image',
            mediaUrl: 'https://example.com/demo-image.jpg',
            fileName: 'demo-image.jpg',
            reactions: [
              { emoji: '🔥', count: 2, reactedByCurrentUser: true },
              { emoji: '👏', count: 1, reactedByCurrentUser: false },
            ],
          },
        ]}
        onBack={vi.fn()}
        onOpenContactInfo={vi.fn()}
        onSendMessage={vi.fn()}
        onStartCall={vi.fn()}
        onTypingStart={vi.fn()}
        onTypingStop={vi.fn()}
        onEditMessage={vi.fn()}
        onDeleteMessage={vi.fn()}
        onForwardMessage={vi.fn()}
        onStarMessage={vi.fn()}
        onPinMessage={vi.fn()}
        onReactMessage={onReactMessage}
        onEmojiClick={vi.fn()}
        onMicClick={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('message-reaction-image-message-1-🔥'));
    expect(onReactMessage).toHaveBeenCalledWith('image-message-1', '🔥');

    fireEvent.click(screen.getByAltText('demo-image.jpg'));
    await screen.findByTestId('image-viewer-modal');
    fireEvent.click(screen.getByTestId('image-viewer-close-button'));

    expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument();
  });

  it('collapses long message bodies and expands them on demand', async () => {
    const longMessage =
      'This is a very long message '.repeat(35) +
      'with enough content to require the read more path in the chat bubble.';

    render(
      <ChatScreen
        chat={baseChat}
        messages={[
          {
            id: 'long-message-1',
            rawId: 'long-message-1',
            sender: 'them',
            text: longMessage,
            time: '10:32',
            status: 'delivered',
            type: 'text',
          },
        ]}
        onBack={vi.fn()}
        onOpenContactInfo={vi.fn()}
        onSendMessage={vi.fn()}
        onStartCall={vi.fn()}
        onTypingStart={vi.fn()}
        onTypingStop={vi.fn()}
        onEditMessage={vi.fn()}
        onDeleteMessage={vi.fn()}
        onForwardMessage={vi.fn()}
        onStarMessage={vi.fn()}
        onPinMessage={vi.fn()}
        onReactMessage={vi.fn()}
        onEmojiClick={vi.fn()}
        onMicClick={vi.fn()}
      />,
    );

    const toggle = screen.getByTestId('message-read-more-long-message-1');
    expect(toggle).toHaveTextContent('Read more');

    fireEvent.click(toggle);
    expect(screen.getByTestId('message-read-more-long-message-1')).toHaveTextContent('Show less');
  });
});
