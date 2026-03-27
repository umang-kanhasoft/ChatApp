import { useEffect, useRef, useState } from 'react';
import { Smile, Plus, Camera, Mic, Send, MapPin, FileText, UserPlus, Circle } from 'lucide-react';
import { EMOJI_CATEGORIES } from '../data/emojis';

function IconEmoji() {
  return <Smile className="h-[22px] w-[22px] text-[#8E8E93]" strokeWidth={1.7} />;
}

function IconAttach() {
  return <Plus className="h-[28px] w-[28px] text-[#007AFF]" strokeWidth={2} />;
}

function IconCamera() {
  return <Camera className="h-[22px] w-[22px] text-[#8E8E93]" strokeWidth={1.8} />;
}

function IconMic() {
  return <Mic className="h-[24px] w-[24px]" strokeWidth={1.7} />;
}

function IconSend() {
  return <Send className="mr-1 h-[20px] w-[20px]" strokeWidth={1.9} />;
}

function IconDocument() {
  return <FileText className="h-6 w-6 text-white" />;
}

function IconLocation() {
  return <MapPin className="h-6 w-6 text-white" />;
}

function IconContact() {
  return <UserPlus className="h-6 w-6 text-white" />;
}

function EmojiDrawer({ onSelectEmoji }) {
  const containerRef = useRef(null);
  const sectionRefs = useRef({});
  const [activeTab, setActiveTab] = useState(EMOJI_CATEGORIES[0].id);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Find section closest to the top
    let currentId = EMOJI_CATEGORIES[0].id;
    for (const category of EMOJI_CATEGORIES) {
      const el = sectionRefs.current[category.id];
      if (el && el.offsetTop <= container.scrollTop + 50) {
        currentId = category.id;
      }
    }
    setActiveTab(currentId);
  };

  const scrollToCategory = (id) => {
    const el = sectionRefs.current[id];
    if (el && containerRef.current) {
      containerRef.current.scrollTo({
        top: el.offsetTop,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="border-t border-[#d3d3d3] bg-[#f7f7f7]">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative h-[260px] overflow-y-auto scrollbar-hide scroll-smooth"
      >
        {EMOJI_CATEGORIES.map((category) => (
          <div
            key={category.id}
            ref={el => sectionRefs.current[category.id] = el}
            className="pb-2"
          >
            <div className="sticky top-0 z-10 bg-[#f7f7f7]/95 px-4 py-2 text-[13px] font-semibold text-[#8e8e93]">
              {category.label}
            </div>
            <div className="grid grid-cols-8 gap-y-2 px-2 pb-4 text-[28px]">
              {category.emojis.map((emoji, index) => (
                <button
                  key={`${category.id}-${emoji}-${index}`}
                  type="button"
                  className="flex bg-transparent h-11 items-center justify-center transition-transform active:scale-125"
                  onClick={() => onSelectEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-around border-t border-[#e0e0e0] bg-[#efefef] px-1 py-2 text-[#b1b1b1]">
        {EMOJI_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => scrollToCategory(category.id)}
            className={[
              'relative text-[22px] leading-none transition-colors h-8 w-8 flex items-center justify-center rounded-full active:bg-black/5',
              activeTab === category.id ? 'text-[#00a884]' : 'text-[#8e8e93]',
            ].join(' ')}
          >
            {category.symbol}
            {activeTab === category.id ? (
              <span className="absolute -bottom-2 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-[#00a884]" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MessageInput({
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
  const [showEmoji, setShowEmoji] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);

  // States for poll/schedule (hidden UI)
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleRecurrence, setScheduleRecurrence] = useState('none');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('');
  const [pollAllowMultipleChoice, setPollAllowMultipleChoice] = useState(false);
  const [pollExpiresInHours, setPollExpiresInHours] = useState('');
  const [composerNotice, setComposerNotice] = useState('');
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: '', phone: '' });

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const textAreaRef = useRef(null);
  const canSend = text.trim().length > 0;

  const syncComposerHeight = () => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${Math.max(nextHeight, 24)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowEmoji(false);
        setIsAddSheetOpen(false);
        setIsContactSheetOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    syncComposerHeight();
  }, [text]);

  const triggerInputFromSheet = (inputRef) => {
    if (disabled) return;
    setIsAddSheetOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.click();
    });
  };

  const handleUploadInputChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadFile?.(file, '');
    event.target.value = '';
  };

  // Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
        onUploadFile?.(file, '');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      setIsAddSheetOpen(false); // Close sheet if started from there
    } catch {
      setComposerNotice('Microphone access was denied or is not supported on this device.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Intentionally don't send anything
      mediaRecorderRef.current.onstop = () => {
        audioChunksRef.current = [];
        setIsRecording(false);
        clearInterval(timerRef.current);
      };
      mediaRecorderRef.current.stop();
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleShareLocation = () => {
    setIsAddSheetOpen(false);
    if (disabled || !onSend) return;

    if (!('geolocation' in navigator)) {
      onSend('Location sharing is not supported on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        onSend(`My location: https://maps.google.com/?q=${latitude},${longitude}`);
      },
      () => {
        onSend('Unable to access location. Please enable location permission and try again.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleShareContact = async () => {
    setIsAddSheetOpen(false);
    if (disabled || !onSend) return;

    const hasNativeContactsPicker =
      typeof navigator !== 'undefined' &&
      navigator.contacts &&
      typeof navigator.contacts.select === 'function';

    if (hasNativeContactsPicker) {
      try {
        const selected = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!Array.isArray(selected) || selected.length === 0) return;
        const picked = selected[0];
        const name = Array.isArray(picked.name) ? picked.name[0] : picked.name;
        const phone = Array.isArray(picked.tel) ? picked.tel[0] : picked.tel;
        const value = [name, phone].filter(Boolean).join(' | ');
        if (value) onSend(`Contact: ${value}`);
        return;
      } catch {
        // fall through to in-app contact composer
      }
    }

    setContactDraft({ name: '', phone: '' });
    setIsContactSheetOpen(true);
  };

  const submitContactDraft = () => {
    const value = [contactDraft.name.trim(), contactDraft.phone.trim()].filter(Boolean).join(' | ');
    if (!value) return;
    onSend?.(`Contact: ${value}`);
    setContactDraft({ name: '', phone: '' });
    setIsContactSheetOpen(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setText('');
    requestAnimationFrame(() => {
      syncComposerHeight();
    });
    onTypingStop?.();
  };

  const handleSchedule = async () => {
    const trimmed = text.trim();
    if (!trimmed || !scheduleAt || !onSchedule) return;

    await onSchedule(trimmed, scheduleAt, scheduleRecurrence);
    setText('');
    setScheduleAt('');
    setScheduleRecurrence('none');
    requestAnimationFrame(() => {
      syncComposerHeight();
    });
    onTypingStop?.();
  };

  const handleCreatePoll = async () => {
    if (!onCreatePoll) return;

    const question = pollQuestion.trim();
    const options = pollOptionsText
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!question || options.length < 2) return;

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
  };

  return (
    <div className="bg-transparent">
      <form
        onSubmit={handleSubmit}
        className="border-t border-[#D8D8D8] bg-[#F6F6F6] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2"
      >
        {replyMessage ? (
          <div className="mb-2 rounded-[4px] border-l-[3px] border-[#00a884] bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[13px] text-[#54656f]">
                {`Replying to: ${replyMessage.content?.text || replyMessage.type}`}
              </span>
              <button type="button" className="text-[12px] text-[#00a884]" onClick={onCancelReply}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">




          {/* Input Pill or Recording UI */}
          <div className={`flex min-h-[36px] flex-1 items-center rounded-[20px] border border-[#D8D8D8] bg-white px-3 py-[4px] ${isRecording ? 'justify-between' : ''}`}>
            {isRecording ? (
              <>
                <div className="flex items-center gap-2 text-[#FF3B30]">
                  <Circle className="h-2 w-2 fill-current animate-pulse" />
                  <span className="text-[16px] font-medium tabular-nums">{formatDuration(recordingDuration)}</span>
                </div>
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="text-[14px] font-semibold text-[#FF3B30] active:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {/* Emoji Icon on Far Left */}
                {!isRecording && (
                  <button
                    type="button"
                    title="Emoji"
                    disabled={disabled}
                    onClick={() => setShowEmoji((value) => !value)}
                    className="-ml-2 inline-flex bg-transparent h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-50"
                  >
                    <IconEmoji />
                  </button>
                )}

                <div className="flex min-w-0 flex-1 self-stretch items-center px-1">
                  <textarea
                    ref={textAreaRef}
                    value={text}
                    onFocus={() => setShowEmoji(false)}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setText(nextValue);
                      if (nextValue.trim()) {
                        onTypingStart?.();
                      } else {
                        onTypingStop?.();
                      }
                    }}
                    rows={1}
                    placeholder={disabled ? 'Select a conversation' : 'Message'}
                    disabled={disabled}
                    className="block max-h-[120px] min-h-[24px] w-full resize-none border-none bg-transparent px-0 py-0 text-[16px] leading-[22px] text-[#000000] outline-none placeholder:text-[#8E8E93]"
                  />
                </div>

                {/* Plus Icon (Attachments) is hidden while recording to match iOS WhatsApp */}
                {!isRecording && (
                  <button
                    type="button"
                    title="Attach"
                    disabled={disabled}
                    onClick={() => setIsAddSheetOpen(true)}
                    className="ml-1 inline-flex bg-transparent h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-50"
                  >
                    <IconAttach />
                  </button>
                )}

                {/* Camera Icon inside Pill (Right side) - Only if not typing */}
                {!canSend && (
                  <button
                    type="button"
                    title="Camera"
                    disabled={disabled}
                    onClick={() => cameraInputRef.current?.click()}
                    className="ml-1 inline-flex bg-transparent h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8E8E93] disabled:opacity-50"
                  >
                    <IconCamera />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Send / Mic Icon on Far Right */}
          <button
            type={canSend ? 'submit' : 'button'}
            disabled={disabled || isSending}
            onClick={() => {
              if (!canSend) {
                if (isRecording) {
                  stopRecording();
                } else {
                  startRecording();
                }
              }
            }}
            className={`inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full transition-all ${canSend || isRecording ? 'bg-[#007AFF] text-white' : 'text-[#007AFF]'} disabled:cursor-not-allowed disabled:opacity-60`}
            title={canSend ? 'Send message' : (isRecording ? 'Stop recording' : 'Record audio')}
          >
            {canSend ? <IconSend /> : (isRecording ? <div className="h-4 w-4 rounded-[2px] bg-white" /> : <IconMic />)}
          </button>
        </div>
      </form>

      {composerNotice ? (
        <div className="px-2 pb-2">
          <div className="flex items-center justify-between rounded-2xl bg-[#1F2C34] px-4 py-3 text-sm text-white">
            <span>{composerNotice}</span>
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8bd1ff]"
              onClick={() => setComposerNotice('')}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {showEmoji ? (
        <EmojiDrawer
          onSelectEmoji={(emoji) => {
            setText((current) => `${current}${emoji}`);
          }}
        />
      ) : null}

      {isContactSheetOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setIsContactSheetOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[24px] bg-[#1F2C34] p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Share Contact</h3>
              <button
                type="button"
                className="text-sm text-[#8bd1ff]"
                onClick={() => setIsContactSheetOpen(false)}
              >
                Cancel
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Contact name"
                value={contactDraft.name}
                onChange={(event) =>
                  setContactDraft((previous) => ({ ...previous, name: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              />
              <input
                type="text"
                placeholder="Phone number"
                value={contactDraft.phone}
                onChange={(event) =>
                  setContactDraft((previous) => ({ ...previous, phone: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              />
              <button
                type="button"
                className="w-full rounded-full bg-[#007AFF] px-4 py-3 text-sm font-semibold text-white"
                onClick={submitContactDraft}
              >
                Share contact
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={handleUploadInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        disabled={disabled}
        onChange={handleUploadInputChange}
      />
      <input
        ref={documentInputRef}
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={handleUploadInputChange}
      />

      {isAddSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-[18px] pb-[max(18px,env(safe-area-inset-bottom))]" onClick={() => setIsAddSheetOpen(false)}>
          <div className="w-full max-w-[460px]" onClick={(event) => event.stopPropagation()}>
            <div className="rounded-[15px] bg-white px-6 py-5 shadow-[0_12px_34px_rgba(0,0,0,0.26)]">
              <div className="grid grid-cols-3 gap-y-7">
                {[
                  {
                    key: 'document',
                    label: 'Document',
                    icon: <IconDocument />,
                    action: () => triggerInputFromSheet(documentInputRef),
                    bgClass: 'bg-[#5b59d3]',
                  },
                  {
                    key: 'camera',
                    label: 'Camera',
                    icon: <IconCamera />,
                    action: () => triggerInputFromSheet(cameraInputRef),
                    bgClass: 'bg-[#e94d8a]',
                  },
                  {
                    key: 'gallery',
                    label: 'Gallery',
                    icon: <IconCamera />,
                    action: () => triggerInputFromSheet(galleryInputRef),
                    bgClass: 'bg-[#8e4fd8]',
                  },
                  {
                    key: 'audio',
                    label: 'Audio',
                    icon: <IconMic />,
                    action: startRecording,
                    bgClass: 'bg-[#f3a13c]',
                  },
                  {
                    key: 'location',
                    label: 'Location',
                    icon: <IconLocation />,
                    action: handleShareLocation,
                    bgClass: 'bg-[#1ba785]',
                  },
                  {
                    key: 'contact',
                    label: 'Contact',
                    icon: <IconContact />,
                    action: handleShareContact,
                    bgClass: 'bg-[#4c8cf7]',
                  },
                ].map((item) => (
                  <button key={item.key} type="button" className="flex flex-col items-center gap-1.5" onClick={item.action}>
                    <span className={`inline-flex h-[58px] w-[58px] items-center justify-center rounded-full text-white ${item.bgClass}`}>
                      {item.icon}
                    </span>
                    <span className="text-[12px] text-[#111b21]">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Hidden legacy features UI */}
      <div className="hidden">
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr,130px,110px]">
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
            disabled={disabled || isSending}
            className="h-9 rounded-md border border-[#d1d7db] bg-white px-2 text-[12px] text-[#54656f] outline-none"
          />
          <select
            value={scheduleRecurrence}
            onChange={(event) => setScheduleRecurrence(event.target.value)}
            disabled={disabled || isSending}
            className="h-9 rounded-md border border-[#d1d7db] bg-white px-2 text-[12px]"
          >
            <option value="none">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <button type="button" onClick={handleSchedule}>Schedule</button>
        </div>
        <div className="mt-2 grid gap-2">
          <input
            type="text"
            value={pollQuestion}
            onChange={(event) => setPollQuestion(event.target.value)}
            placeholder="Poll question"
          />
          <button type="button" onClick={handleCreatePoll}>Create Poll</button>
        </div>
      </div>
    </div>
  );
}
