import { useState } from 'react';

export default function MessageComposer({
  disabled,
  onSend,
  onSchedule,
  onCreatePoll,
  onTypingStart,
  onTypingStop,
  isSending,
  replyMessage,
  onCancelReply,
  onUploadFile,
}) {
  const [text, setText] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleRecurrence, setScheduleRecurrence] = useState('none');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('');
  const [pollAllowMultipleChoice, setPollAllowMultipleChoice] = useState(false);
  const [pollExpiresInHours, setPollExpiresInHours] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    onSend(trimmed);
    setText('');
    onTypingStop?.();
  };

  const handleSchedule = async () => {
    const trimmed = text.trim();
    if (!trimmed || !scheduleAt) return;
    if (!onSchedule) return;

    try {
      await onSchedule(trimmed, scheduleAt, scheduleRecurrence);
      setText('');
      setScheduleAt('');
      setScheduleRecurrence('none');
      onTypingStop?.();
    } catch {
      // no-op
    }
  };

  const handleCreatePoll = async () => {
    if (!onCreatePoll) return;

    const question = pollQuestion.trim();
    const options = pollOptionsText
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!question || options.length < 2) return;

    try {
      const parsedExpiryHours = Number(pollExpiresInHours);
      const expiresAt =
        Number.isFinite(parsedExpiryHours) && parsedExpiryHours > 0
          ? new Date(Date.now() + parsedExpiryHours * 60 * 60 * 1000).toISOString()
          : null;

      await onCreatePoll({
        question,
        options,
        allowMultipleChoice: pollAllowMultipleChoice,
        expiresAt,
      });
      setPollQuestion('');
      setPollOptionsText('');
      setPollAllowMultipleChoice(false);
      setPollExpiresInHours('');
    } catch {
      // no-op
    }
  };

  return (
    <form className="message-composer" onSubmit={handleSubmit}>
      {replyMessage ? (
        <div className="reply-banner">
          <span>{`Replying to: ${replyMessage.content?.text || replyMessage.type}`}</span>
          <button type="button" className="ghost-btn" onClick={onCancelReply}>
            Cancel
          </button>
        </div>
      ) : null}
      <div className="composer-main-row">
        <button type="button" className="composer-icon-btn" disabled={disabled} title="Emoji">
          🙂
        </button>
        <input
          type="text"
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (next.trim()) {
              onTypingStart?.();
            } else {
              onTypingStop?.();
            }
          }}
          placeholder={
            disabled
              ? 'Select a conversation to start chatting'
              : 'Type a message'
          }
          disabled={disabled}
        />
        <label className="upload-btn composer-icon-btn" title="Upload media">
          <input
            type="file"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              onUploadFile?.(file, text);
              event.target.value = '';
            }}
          />
          📎
        </label>
        <button type="submit" className="composer-send-btn" disabled={disabled || isSending}>
          {isSending ? '...' : '➤'}
        </button>
      </div>
      <div className="composer-schedule-row">
        <input
          type="datetime-local"
          value={scheduleAt}
          onChange={(event) => setScheduleAt(event.target.value)}
          disabled={disabled || isSending}
        />
        <select
          value={scheduleRecurrence}
          onChange={(event) => setScheduleRecurrence(event.target.value)}
          disabled={disabled || isSending}
        >
          <option value="none">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <button
          type="button"
          className="ghost-btn"
          onClick={handleSchedule}
          disabled={disabled || isSending || !scheduleAt || !text.trim() || !onSchedule}
        >
          Schedule
        </button>
      </div>
      <div className="composer-poll-row">
        <input
          type="text"
          value={pollQuestion}
          onChange={(event) => setPollQuestion(event.target.value)}
          placeholder="Poll question"
          disabled={disabled || isSending}
        />
        <input
          type="text"
          value={pollOptionsText}
          onChange={(event) => setPollOptionsText(event.target.value)}
          placeholder="Options (comma separated)"
          disabled={disabled || isSending}
        />
        <button
          type="button"
          className="ghost-btn"
          onClick={handleCreatePoll}
          disabled={disabled || isSending || !pollQuestion.trim() || !pollOptionsText.trim() || !onCreatePoll}
        >
          Create Poll
        </button>
      </div>
      <div className="composer-poll-row">
        <label className="composer-poll-checkbox">
          <input
            type="checkbox"
            checked={pollAllowMultipleChoice}
            onChange={(event) => setPollAllowMultipleChoice(event.target.checked)}
            disabled={disabled || isSending}
          />
          Allow multiple choices
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={pollExpiresInHours}
          onChange={(event) => setPollExpiresInHours(event.target.value)}
          placeholder="Expires in hours (optional)"
          disabled={disabled || isSending}
        />
      </div>
    </form>
  );
}
