import { useEffect, useRef, useState } from 'react';
import { Icons } from '../assets/icons.jsx';

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const resolveRecorderOptions = (mimeTypes) => {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  if (typeof MediaRecorder.isTypeSupported !== 'function') {
    return {};
  }

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return { mimeType };
    }
  }

  return {};
};

const extensionForMimeType = (mimeType, fallback = 'bin') => {
  if (!mimeType) return fallback;
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('webm')) return 'webm';
  return fallback;
};

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const INITIAL_MESSAGE_ANCHOR = { top: 24, left: 16, width: 0, placement: 'above' };
const getMessageId = (message) => message?.rawId || message?.id;
const estimateLineCount = (text = '', charsPerLine = 34) =>
  text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil((line.trim().length || 1) / charsPerLine)), 0);
const isExpandableText = (text, maxLines, charsPerLine = 34) => estimateLineCount(text, charsPerLine) > maxLines;

const renderMessageBody = (message, { onOpenImage, renderTextContent }) => {
  if (message.type === 'poll') {
    return (
      <div style={styles.pollCard}>
        <span style={styles.pollTitle}>{message.pollQuestion || 'Poll'}</span>
        <span style={styles.pollMeta}>
          {message.pollOptionCount ? `${message.pollOptionCount} options` : 'Tap to vote'}
        </span>
      </div>
    );
  }

  if (message.type === 'image' && message.mediaUrl) {
    return (
      <div style={styles.mediaCard}>
        <button
          type="button"
          style={styles.mediaImageBtn}
          onClick={(event) => {
            event.stopPropagation();
            onOpenImage?.(message);
          }}
        >
          <img style={styles.mediaImage} src={message.mediaUrl} alt={message.fileName || 'Image'} />
        </button>
        {message.text ? renderTextContent?.(message.text, `${getMessageId(message)}-caption`, 'caption') : null}
      </div>
    );
  }

  if (message.type === 'video' && message.mediaUrl) {
    return (
      <div style={styles.mediaCard}>
        <video style={styles.mediaVideo} src={message.mediaUrl} controls playsInline preload="metadata" />
        {message.text ? renderTextContent?.(message.text, `${getMessageId(message)}-caption`, 'caption') : null}
      </div>
    );
  }

  if ((message.type === 'audio' || message.type === 'voice') && message.mediaUrl) {
    return (
      <audio style={styles.mediaAudio} src={message.mediaUrl} controls preload="metadata" />
    );
  }

  if (message.type === 'document' && message.mediaUrl) {
    return (
      <a style={styles.documentCard} href={message.mediaUrl} target="_blank" rel="noreferrer">
        <span style={styles.documentTitle}>{message.fileName || 'Document'}</span>
        <span style={styles.documentMeta}>Tap to open</span>
      </a>
    );
  }

  if (message.type === 'image') {
    return (
      <div style={styles.imagePlaceholder}>
        <span style={{ fontSize: 40 }}>🖼️</span>
      </div>
    );
  }

  return renderTextContent?.(message.text, getMessageId(message), 'message') || null;
};

export default function ChatScreen({
  chat,
  messages = [],
  isLoading = false,
  typingLabel = '',
  currentCall,
  onBack,
  onOpenContactInfo,
  onSendMessage,
  onSendPoll,
  onUploadFile,
  onStartCall,
  onTypingStart,
  onTypingStop,
  onEditMessage,
  onDeleteMessage,
  onForwardMessage,
  _onStarMessage,
  onPinMessage,
  onReactMessage,
  _onReportMessage,
  _onBlockUser,
  onEmojiClick,
  onMicClick,
}) {
  const [inputText, setInputText] = useState('');
  const [showAttachment, setShowAttachment] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState(null);
  const [selectedMessageAnchor, setSelectedMessageAnchor] = useState(INITIAL_MESSAGE_ANCHOR);
  const [swipeState, setSwipeState] = useState({ messageId: null, offset: 0 });
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: '', phone: '' });
  const [showPollSheet, setShowPollSheet] = useState(false);
  const [pollDraft, setPollDraft] = useState({ question: '', options: '' });
  const [composerNotice, setComposerNotice] = useState('');
  const [expandedMessageIds, setExpandedMessageIds] = useState([]);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordingDuration, setVoiceRecordingDuration] = useState(0);
  const [isSendingVoiceNote, setIsSendingVoiceNote] = useState(false);
  const [isCameraCaptureOpen, setIsCameraCaptureOpen] = useState(false);
  const [cameraCaptureError, setCameraCaptureError] = useState('');
  const [cameraCaptureState, setCameraCaptureState] = useState('idle');
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');
  const [capturedMedia, setCapturedMedia] = useState(null);
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [videoRecordingDuration, setVideoRecordingDuration] = useState(0);
  const messagesEndRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceRecorderOptionsRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceActionRef = useRef('discard');
  const voiceTimerRef = useRef(null);
  const captureVideoRef = useRef(null);
  const captureStreamRef = useRef(null);
  const captureRecorderRef = useRef(null);
  const captureRecorderOptionsRef = useRef(null);
  const captureChunksRef = useRef([]);
  const captureRecorderActionRef = useRef('discard');
  const captureTimerRef = useRef(null);
  const capturedMediaRef = useRef(null);
  const messageHoldTimerRef = useRef(null);
  const swipeGestureRef = useRef({ message: null, startX: 0, startY: 0, offset: 0, active: false });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    capturedMediaRef.current = capturedMedia;
  }, [capturedMedia]);

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onTypingStop?.();
    },
    [onTypingStop],
  );

  const clearVoiceTimer = () => {
    if (!voiceTimerRef.current) return;
    clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = null;
  };

  const stopVoiceStream = () => {
    if (!voiceStreamRef.current) return;
    for (const track of voiceStreamRef.current.getTracks()) {
      track.stop();
    }
    voiceStreamRef.current = null;
  };

  const clearCaptureTimer = () => {
    if (!captureTimerRef.current) return;
    clearInterval(captureTimerRef.current);
    captureTimerRef.current = null;
  };

  const stopCaptureStream = () => {
    if (captureStreamRef.current) {
      for (const track of captureStreamRef.current.getTracks()) {
        track.stop();
      }
      captureStreamRef.current = null;
    }

    if (captureVideoRef.current) {
      captureVideoRef.current.srcObject = null;
    }
  };

  const clearCapturedMedia = () => {
    setCapturedMedia((previous) => {
      if (previous?.url) {
        URL.revokeObjectURL(previous.url);
      }
      return null;
    });
  };

  const clearMessageHoldTimer = () => {
    if (!messageHoldTimerRef.current) return;
    clearTimeout(messageHoldTimerRef.current);
    messageHoldTimerRef.current = null;
  };

  const clearSwipeState = () => {
    swipeGestureRef.current = { message: null, startX: 0, startY: 0, offset: 0, active: false };
    setSwipeState({ messageId: null, offset: 0 });
  };

  useEffect(
    () => () => {
      clearVoiceTimer();
      clearCaptureTimer();
      stopVoiceStream();
      stopCaptureStream();
      if (capturedMediaRef.current?.url) {
        URL.revokeObjectURL(capturedMediaRef.current.url);
      }
      clearMessageHoldTimer();
    },
    [],
  );

  const uploadCapturedFile = async (file, failureMessage) => {
    if (!file || !onUploadFile) return;

    try {
      await Promise.resolve(onUploadFile(file));
    } catch {
      setComposerNotice(failureMessage);
      throw new Error(failureMessage);
    }
  };

  const startVoiceRecording = async () => {
    if (isVoiceRecording || isSendingVoiceNote) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onMicClick?.();
      setComposerNotice('Voice recording is not supported in this browser.');
      return;
    }

    setComposerNotice('');
    setShowAttachment(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorderOptions =
        resolveRecorderOptions([
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/ogg',
          'audio/mp4',
        ]) || {};
      const recorder = Object.keys(recorderOptions).length
        ? new MediaRecorder(stream, recorderOptions)
        : new MediaRecorder(stream);

      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceRecorderOptionsRef.current = recorderOptions;
      voiceChunksRef.current = [];
      voiceActionRef.current = 'discard';
      setIsVoiceRecording(true);
      setVoiceRecordingDuration(0);
      clearVoiceTimer();
      voiceTimerRef.current = setInterval(() => {
        setVoiceRecordingDuration((previous) => previous + 1);
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const action = voiceActionRef.current;
        const chunks = [...voiceChunksRef.current];
        const mimeType =
          recorder.mimeType ||
          voiceRecorderOptionsRef.current?.mimeType ||
          'audio/webm';

        clearVoiceTimer();
        stopVoiceStream();
        voiceRecorderRef.current = null;
        voiceRecorderOptionsRef.current = null;
        voiceChunksRef.current = [];
        voiceActionRef.current = 'discard';
        setIsVoiceRecording(false);
        setVoiceRecordingDuration(0);

        if (action !== 'send' || chunks.length === 0) {
          return;
        }

        setIsSendingVoiceNote(true);
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const extension = extensionForMimeType(mimeType, 'webm');
          const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mimeType });
          await uploadCapturedFile(file, 'Unable to send the voice note. Please try again.');
        } finally {
          setIsSendingVoiceNote(false);
        }
      };

      recorder.start(250);
    } catch {
      stopVoiceStream();
      clearVoiceTimer();
      setIsVoiceRecording(false);
      setVoiceRecordingDuration(0);
      setComposerNotice('Microphone access was denied or is not available on this device.');
    }
  };

  const finishVoiceRecording = (action) => {
    if (!voiceRecorderRef.current || voiceRecorderRef.current.state === 'inactive') {
      clearVoiceTimer();
      setIsVoiceRecording(false);
      setVoiceRecordingDuration(0);
      return;
    }

    voiceActionRef.current = action;
    voiceRecorderRef.current.stop();
  };

  const closeCameraCapture = () => {
    captureRecorderActionRef.current = 'discard';
    if (captureRecorderRef.current && captureRecorderRef.current.state !== 'inactive') {
      captureRecorderRef.current.stop();
    }

    clearCaptureTimer();
    stopCaptureStream();
    clearCapturedMedia();
    captureRecorderRef.current = null;
    captureRecorderOptionsRef.current = null;
    captureChunksRef.current = [];
    captureRecorderActionRef.current = 'discard';
    setIsVideoRecording(false);
    setVideoRecordingDuration(0);
    setCameraCaptureState('idle');
    setCameraCaptureError('');
    setIsCameraCaptureOpen(false);
  };

  const startCameraPreview = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraCaptureState('unsupported');
      setCameraCaptureError('Camera access is unavailable in this browser.');
      return;
    }

    setCameraCaptureState('prompt');
    setCameraCaptureError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacingMode } },
        audio: false,
      });

      stopCaptureStream();
      captureStreamRef.current = stream;
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream;
      }
      setCameraCaptureState('ready');
    } catch (error) {
      const errorName = String(error?.name || '').toLowerCase();
      if (errorName.includes('notallowed') || errorName.includes('permission')) {
        setCameraCaptureState('denied');
        setCameraCaptureError('Camera permission denied. Allow camera access and try again.');
        return;
      }

      setCameraCaptureState('error');
      setCameraCaptureError(error?.message || 'Unable to open the camera.');
    }
  };

  useEffect(() => {
    if (!isCameraCaptureOpen || capturedMedia) {
      return undefined;
    }

    void startCameraPreview();
    return () => {
      stopCaptureStream();
    };
  }, [cameraFacingMode, capturedMedia, isCameraCaptureOpen]);

  const openCameraCapture = () => {
    setShowAttachment(false);
    setComposerNotice('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    clearCapturedMedia();
    setCapturedMedia(null);
    setCameraCaptureError('');
    setCameraCaptureState('idle');
    setIsVideoRecording(false);
    setVideoRecordingDuration(0);
    setIsCameraCaptureOpen(true);
  };

  const capturePhoto = async () => {
    const video = captureVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraCaptureError('Camera preview is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraCaptureError('Unable to capture a photo on this device.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92);
    });

    if (!blob) {
      setCameraCaptureError('Unable to capture a photo on this device.');
      return;
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    clearCapturedMedia();
    stopCaptureStream();
    setCapturedMedia({
      kind: 'image',
      file,
      url: URL.createObjectURL(file),
    });
    setCameraCaptureState('captured');
  };

  const startVideoRecording = async () => {
    if (isVideoRecording) return;

    const stream = captureStreamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setCameraCaptureError('Video recording is not supported on this device.');
      return;
    }

    try {
      const recorderOptions =
        resolveRecorderOptions([
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4',
        ]) || {};
      const recorder = Object.keys(recorderOptions).length
        ? new MediaRecorder(stream, recorderOptions)
        : new MediaRecorder(stream);

      captureRecorderRef.current = recorder;
      captureRecorderOptionsRef.current = recorderOptions;
      captureChunksRef.current = [];
      captureRecorderActionRef.current = 'preview';
      setIsVideoRecording(true);
      setVideoRecordingDuration(0);
      clearCaptureTimer();
      captureTimerRef.current = setInterval(() => {
        setVideoRecordingDuration((previous) => previous + 1);
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          captureChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const action = captureRecorderActionRef.current;
        const chunks = [...captureChunksRef.current];
        const mimeType =
          recorder.mimeType ||
          captureRecorderOptionsRef.current?.mimeType ||
          'video/webm';

        clearCaptureTimer();
        stopCaptureStream();
        captureRecorderRef.current = null;
        captureRecorderOptionsRef.current = null;
        captureChunksRef.current = [];
        captureRecorderActionRef.current = 'discard';
        setIsVideoRecording(false);
        setVideoRecordingDuration(0);

        if (action !== 'preview' || chunks.length === 0) {
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        const extension = extensionForMimeType(mimeType, 'webm');
        const file = new File([blob], `video-${Date.now()}.${extension}`, { type: mimeType });
        clearCapturedMedia();
        setCapturedMedia({
          kind: 'video',
          file,
          url: URL.createObjectURL(file),
        });
        setCameraCaptureState('captured');
      };

      recorder.start(250);
      setCameraCaptureState('recording');
    } catch {
      setCameraCaptureError('Unable to start video recording on this device.');
    }
  };

  const stopVideoRecording = (action = 'preview') => {
    if (!captureRecorderRef.current || captureRecorderRef.current.state === 'inactive') {
      clearCaptureTimer();
      setIsVideoRecording(false);
      setVideoRecordingDuration(0);
      return;
    }

    captureRecorderActionRef.current = action;
    captureRecorderRef.current.stop();
  };

  const retakeCapturedMedia = () => {
    clearCapturedMedia();
    setCapturedMedia(null);
    setCameraCaptureState('idle');
    setCameraCaptureError('');
  };

  const sendCapturedMedia = async () => {
    if (!capturedMedia?.file) return;

    try {
      await uploadCapturedFile(
        capturedMedia.file,
        capturedMedia.kind === 'video'
          ? 'Unable to send the recorded video. Please try again.'
          : 'Unable to send the captured photo. Please try again.',
      );
      closeCameraCapture();
    } catch {
      // Notice is set inside uploadCapturedFile.
    }
  };

  const queueTypingStop = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      onTypingStop?.();
    }, 1200);
  };

  const openImageViewer = (message) => {
    if (!message?.mediaUrl) return;
    setFullscreenImage({
      src: message.mediaUrl,
      alt: message.fileName || 'Image',
    });
  };

  const selectedMessages = selectedMessageIds
    .map((messageId) => messages.find((message) => getMessageId(message) === messageId))
    .filter(Boolean);
  const primarySelectedMessage =
    selectedMessages.find((message) => getMessageId(message) === activeReactionMessageId) ||
    selectedMessages[selectedMessages.length - 1] ||
    null;

  const clearSelection = () => {
    setSelectedMessageIds([]);
    setActiveReactionMessageId(null);
    setSelectedMessageAnchor(INITIAL_MESSAGE_ANCHOR);
  };

  const closeReactionMenu = () => {
    setActiveReactionMessageId(null);
    setSelectedMessageAnchor(INITIAL_MESSAGE_ANCHOR);
  };

  const toggleMessageSelection = (message, { forceSelect = false, keepReaction = false } = {}) => {
    const messageId = getMessageId(message);
    if (!messageId) return;

    const nextSelectedMessageIds = forceSelect
      ? selectedMessageIds.includes(messageId)
        ? selectedMessageIds
        : [...selectedMessageIds, messageId]
      : selectedMessageIds.includes(messageId)
        ? selectedMessageIds.filter((selectedId) => selectedId !== messageId)
        : [...selectedMessageIds, messageId];

    setSelectedMessageIds(nextSelectedMessageIds);

    if (!keepReaction) {
      closeReactionMenu();
      return;
    }

    if (!nextSelectedMessageIds.includes(activeReactionMessageId)) {
      closeReactionMenu();
    }
  };

  const openMessageMenu = (message) => {
    if (!message) return;

    const messageId = getMessageId(message);
    if (typeof document !== 'undefined') {
      const bubble = document.querySelector(`[data-testid="message-bubble-${messageId}"]`);
      const rect = bubble?.getBoundingClientRect?.();
      if (rect) {
        const dockWidth = 296;
        const dockLeft = Math.min(
          window.innerWidth - dockWidth - 16,
          Math.max(16, rect.left + rect.width / 2 - dockWidth / 2),
        );
        const shouldPlaceBelow = rect.top < 84;
        const dockTop = shouldPlaceBelow ? rect.bottom + 10 : Math.max(18, rect.top - 66);
        setSelectedMessageAnchor({
          top: dockTop,
          left: dockLeft,
          width: rect.width,
          placement: shouldPlaceBelow ? 'below' : 'above',
        });
      }
    }

    if (!selectedMessageIds.includes(messageId)) {
      setSelectedMessageIds((previous) => [...previous, messageId]);
    }
    setActiveReactionMessageId(messageId);
  };

  const startMessageHold = (message) => {
    clearMessageHoldTimer();
    messageHoldTimerRef.current = setTimeout(() => {
      openMessageMenu(message);
      messageHoldTimerRef.current = null;
    }, 380);
  };

  const stopMessageHold = () => {
    clearMessageHoldTimer();
  };

  const handleSelectedMessageClick = (message) => {
    if (!selectedMessageIds.length) return;
    toggleMessageSelection(message);
  };

  const toggleExpandedMessage = (messageKey) => {
    if (!messageKey) return;

    setExpandedMessageIds((previous) =>
      previous.includes(messageKey)
        ? previous.filter((entry) => entry !== messageKey)
        : [...previous, messageKey],
    );
  };

  const renderTextContent = (text, messageKey, variant = 'message') => {
    if (!text) return null;

    const isReplyVariant = variant === 'reply' || variant === 'reply-preview';
    const maxLines = isReplyVariant ? 2 : 10;
    const charsPerLine = isReplyVariant ? 30 : variant === 'caption' ? 34 : 36;
    const canExpand = !isReplyVariant && isExpandableText(text, maxLines, charsPerLine);
    const isExpanded = expandedMessageIds.includes(messageKey);

    return (
      <div style={variant === 'caption' ? styles.mediaCaptionBlock : styles.textContentBlock}>
        <span
          style={{
            ...styles.messageText,
            ...(variant === 'caption' ? styles.mediaCaption : {}),
            ...(variant === 'reply' ? styles.replyBubbleText : {}),
            ...(variant === 'reply-preview' ? styles.replyTextPreview : {}),
            ...(!isExpanded && canExpand ? styles.messageTextClamp : {}),
            ...(isReplyVariant ? styles.replyTextClamp : {}),
          }}
        >
          {text}
        </span>
        {canExpand ? (
          <button
            type="button"
            style={styles.readMoreBtn}
            data-testid={`message-read-more-${messageKey}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleExpandedMessage(messageKey);
            }}
          >
            {isExpanded ? 'Show less' : 'Read more'}
          </button>
        ) : null}
      </div>
    );
  };

  const beginMessageGesture = (message, point) => {
    if (!point) return;
    swipeGestureRef.current = {
      message,
      startX: point.clientX,
      startY: point.clientY,
      offset: 0,
      active: false,
    };
    startMessageHold(message);
  };

  const updateMessageGesture = (point) => {
    if (!point || !swipeGestureRef.current.message) return;

    const deltaX = point.clientX - swipeGestureRef.current.startX;
    const deltaY = point.clientY - swipeGestureRef.current.startY;

    if (!swipeGestureRef.current.active) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
        return;
      }

      if (deltaX <= 0 || Math.abs(deltaY) > Math.abs(deltaX)) {
        stopMessageHold();
        clearSwipeState();
        return;
      }

      stopMessageHold();
      swipeGestureRef.current.active = true;
    }

    const offset = Math.min(78, Math.max(0, deltaX * 0.42));
    swipeGestureRef.current.offset = offset;
    setSwipeState({
      messageId: swipeGestureRef.current.message.rawId || swipeGestureRef.current.message.id,
      offset,
    });
  };

  const finishMessageGesture = () => {
    stopMessageHold();

    const { active, offset, message } = swipeGestureRef.current;
    if (active && offset >= 34 && message) {
      setReplyingTo(message);
    }

    clearSwipeState();
  };

  const cancelMessageGesture = () => {
    stopMessageHold();
    clearSwipeState();
  };

  const handleComposerChange = (event) => {
    const nextValue = event.target.value;
    setInputText(nextValue);

    if (nextValue.trim()) {
      onTypingStart?.();
      queueTypingStop();
      return;
    }

    onTypingStop?.();
  };

  const sendMessage = () => {
    if (!inputText.trim()) {
      return;
    }
    if (editingMessage) {
      onEditMessage?.(editingMessage.rawId || editingMessage.id, inputText.trim());
      setEditingMessage(null);
    } else {
      onSendMessage?.(inputText.trim(), replyingTo);
      setReplyingTo(null);
    }
    setInputText('');
    onTypingStop?.();
  };

  const handleUploadChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadFile?.(file);
    event.target.value = '';
    setShowAttachment(false);
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      onSendMessage?.('Location sharing is not supported on this device.', null);
      setShowAttachment(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        onSendMessage?.(`My location: https://maps.google.com/?q=${latitude},${longitude}`, null);
        setShowAttachment(false);
      },
      () => {
        onSendMessage?.('Unable to access location. Please enable location permission and try again.', null);
        setShowAttachment(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleShareContact = async () => {
    const hasNativeContactsPicker =
      typeof navigator !== 'undefined' &&
      navigator.contacts &&
      typeof navigator.contacts.select === 'function';

    if (hasNativeContactsPicker) {
      try {
        const selected = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (Array.isArray(selected) && selected.length > 0) {
          const picked = selected[0];
          const name = Array.isArray(picked.name) ? picked.name[0] : picked.name;
          const phone = Array.isArray(picked.tel) ? picked.tel[0] : picked.tel;
          const value = [name, phone].filter(Boolean).join(' | ');
          if (value) {
            onSendMessage?.(`Contact: ${value}`, null);
          }
          setShowAttachment(false);
          return;
        }
      } catch {
        // Fall through to in-app composer.
      }
    }

    setShowAttachment(false);
    setContactDraft({ name: '', phone: '' });
    setShowContactSheet(true);
  };

  const handleCreatePoll = () => {
    if (!onSendPoll) return;
    setShowAttachment(false);
    setPollDraft({ question: '', options: '' });
    setShowPollSheet(true);
  };

  const submitContactDraft = () => {
    const value = [contactDraft.name.trim(), contactDraft.phone.trim()].filter(Boolean).join(' | ');
    if (!value) return;
    onSendMessage?.(`Contact: ${value}`, null);
    setContactDraft({ name: '', phone: '' });
    setShowContactSheet(false);
  };

  const submitPollDraft = () => {
    const question = pollDraft.question.trim();
    const options = pollDraft.options
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!question || options.length < 2) return;

    onSendPoll?.({ question, options });
    setPollDraft({ question: '', options: '' });
    setShowPollSheet(false);
  };

  const selectionActions = primarySelectedMessage
    ? [
      ...(selectedMessages.length === 1
        ? [
          {
            key: 'reply',
            label: 'Reply',
            icon: '↩',
            action: () => {
              setReplyingTo(primarySelectedMessage);
              clearSelection();
            },
          },
        ]
        : []),
      {
        key: 'forward',
        label: 'Forward',
        icon: '↗',
        action: () => {
          selectedMessages.forEach((message) => {
            onForwardMessage?.(message);
          });
          clearSelection();
        },
      },
      ...(selectedMessages.some((message) => message.text)
        ? [
          {
            key: 'copy',
            label: 'Copy',
            icon: '⧉',
            action: () => {
              navigator.clipboard
                .writeText(selectedMessages.map((message) => message.text).filter(Boolean).join('\n'))
                .catch(() => { });
              clearSelection();
            },
          },
        ]
        : []),
      {
        key: 'pin',
        label: 'Pin',
        icon: '📌',
        action: () => {
          selectedMessages.forEach((message) => {
            onPinMessage?.(getMessageId(message));
          });
          clearSelection();
        },
      },
      ...(selectedMessages.length === 1 && primarySelectedMessage.sender === 'me' && primarySelectedMessage.text
        ? [
          {
            key: 'edit',
            label: 'Edit',
            icon: '✎',
            action: () => {
              setEditingMessage(primarySelectedMessage);
              setInputText(primarySelectedMessage.text);
              setReplyingTo(null);
              clearSelection();
            },
          },
        ]
        : []),
      {
        key: 'delete',
        label: 'Delete',
        icon: '🗑',
        danger: true,
        action: () => {
          selectedMessages.forEach((message) => {
            onDeleteMessage?.(getMessageId(message));
          });
          clearSelection();
        },
      },
    ]
    : [];

  return (
    <div style={styles.container} data-testid="chat-screen">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        data-testid="camera-upload-input"
        capture="environment"
        style={styles.hiddenInput}
        onChange={handleUploadChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        data-testid="gallery-upload-input"
        style={styles.hiddenInput}
        onChange={handleUploadChange}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        data-testid="document-upload-input"
        style={styles.hiddenInput}
        onChange={handleUploadChange}
      />

      <div style={styles.header}>
        <button
          style={styles.backBtn}
          data-testid={selectedMessages.length ? 'clear-message-selection-button' : 'chat-back-button'}
          onClick={selectedMessages.length ? clearSelection : onBack}
        >
          <Icons.Back />
        </button>
        {selectedMessages.length ? (
          <>
            <div style={styles.selectionHeaderInfo} data-testid="selected-message-header">
              <span style={styles.selectionHeaderTitle}>
                {selectedMessages.length} selected
              </span>
              <span style={styles.selectionHeaderSubtitle}>
                {selectedMessages.length === 1
                  ? primarySelectedMessage?.sender === 'me'
                    ? 'Your message'
                    : `Message from ${chat.name}`
                  : 'Choose an action for these messages'}
              </span>
            </div>
            <div style={styles.selectionHeaderActions}>
              {selectionActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  style={{
                    ...styles.selectionActionBtn,
                    ...(action.danger ? styles.selectionActionBtnDanger : {}),
                  }}
                  data-testid={`message-action-${action.key}`}
                  onClick={action.action}
                  title={action.label}
                  aria-label={action.label}
                >
                  <span style={styles.selectionActionIcon}>{action.icon}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={styles.headerCenter} onClick={onOpenContactInfo}>
              <div style={styles.headerAvatar}>
                <span style={{ fontSize: 18 }}>{chat.avatar}</span>
              </div>
              <div style={styles.headerInfo}>
                <span style={styles.headerName}>{chat.name}</span>
                <span style={styles.headerStatus}>
                  {typingLabel
                    ? typingLabel
                    : chat.online
                      ? 'online'
                      : chat.isGroup
                        ? `${chat.members?.length || 0} members`
                        : chat.lastSeen || 'tap here for info'}
                </span>
              </div>
            </div>
            <div style={styles.headerActions}>
              <button
                style={styles.headerBtn}
                data-testid="start-video-call-button"
                onClick={() => onStartCall?.('video')}
                disabled={!onStartCall || Boolean(currentCall)}
              >
                <Icons.VideoCall />
              </button>
              <button
                style={styles.headerBtn}
                data-testid="start-voice-call-button"
                onClick={() => onStartCall?.('voice')}
                disabled={!onStartCall || Boolean(currentCall)}
              >
                <Icons.Phone />
              </button>
            </div>
          </>
        )}
      </div>

      <div
        style={styles.messagesContainer}
        data-testid="message-list"
        onScroll={() => {
          if (activeReactionMessageId) {
            closeReactionMenu();
          }
        }}
      >
        <div style={styles.encryptionNotice}>
          <Icons.Lock />
          <span style={styles.encryptionText}>
            Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or
            listen to them. Tap to learn more.
          </span>
        </div>
        <div style={styles.dateSeparator}>
          <span style={styles.dateText}>TODAY</span>
        </div>
        {isLoading ? <div style={styles.loadingText}>Loading messages...</div> : null}
        {messages.map((message) => {
          const isMe = message.sender === 'me';
          const messageId = getMessageId(message);
          const isSelected = selectedMessageIds.includes(messageId);
          const hasMediaCard = ['image', 'video', 'audio', 'voice'].includes(message.type) && message.mediaUrl;
          const swipeOffset = swipeState.messageId === messageId ? swipeState.offset : 0;
          const replyCueOpacity = Math.min(1, swipeOffset / 28);
          const bubbleBaseStyle = hasMediaCard
            ? {
              ...styles.bubble,
              ...styles.mediaBubble,
              background: isMe ? styles.outgoingMediaBubble.background : styles.incomingMediaBubble.background,
              color: isMe ? styles.outgoingBubble.color : styles.incomingBubble.color,
            }
            : {
              ...styles.bubble,
              background: isMe ? styles.outgoingBubble.background : styles.incomingBubble.background,
              color: isMe ? styles.outgoingBubble.color : styles.incomingBubble.color,
            };

          return (
            <div
              key={message.id}
              data-testid={`message-row-${messageId}`}
              style={{ ...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}
              onClick={() => {
                if (!selectedMessageIds.length) return;
                handleSelectedMessageClick(message);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                openMessageMenu(message);
              }}
              onMouseDown={(event) => {
                if (selectedMessageIds.length) return;
                beginMessageGesture(message, event);
              }}
              onMouseMove={(event) => {
                if (selectedMessageIds.length) return;
                updateMessageGesture(event);
              }}
              onMouseUp={() => {
                if (selectedMessageIds.length) return;
                finishMessageGesture();
              }}
              onMouseLeave={() => {
                if (selectedMessageIds.length) return;
                cancelMessageGesture();
              }}
              onTouchStart={(event) => {
                if (selectedMessageIds.length) return;
                beginMessageGesture(message, event.touches[0]);
              }}
              onTouchMove={(event) => {
                if (selectedMessageIds.length) return;
                updateMessageGesture(event.touches[0]);
              }}
              onTouchEnd={() => {
                if (selectedMessageIds.length) return;
                finishMessageGesture();
              }}
              onTouchCancel={() => {
                if (selectedMessageIds.length) return;
                cancelMessageGesture();
              }}
            >
              <div style={styles.messageSwipeTrack}>
                <div
                  style={{
                    ...styles.swipeReplyCue,
                    opacity: replyCueOpacity,
                    transform: `translateY(-50%) scale(${0.84 + replyCueOpacity * 0.16})`,
                  }}
                >
                  ↩
                </div>
                <div
                  data-testid={`message-bubble-${messageId}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  style={{
                    ...bubbleBaseStyle,
                    ...(isSelected ? styles.selectedBubble : {}),
                    borderRadius: isMe ? '22px 22px 8px 22px' : '22px 22px 22px 8px',
                    maxWidth: hasMediaCard ? '82%' : '76%',
                    transform: swipeOffset ? `translateX(${swipeOffset}px)` : 'translateX(0)',
                    transition: swipeOffset ? 'none' : 'transform 160ms ease',
                  }}
                >
                  {chat.isGroup && !isMe && message.senderName ? (
                    <span style={styles.senderName}>{message.senderName}</span>
                  ) : null}
                  {message.replyTo ? (
                    <div style={styles.replyBubble}>
                      {renderTextContent(
                        message.replyTo.text || message.replyTo.preview,
                        `${messageId}-reply`,
                        'reply',
                      )}
                    </div>
                  ) : null}
                  {renderMessageBody(message, { onOpenImage: openImageViewer, renderTextContent })}
                  {message.reactions?.length ? (
                    <div style={styles.reactionStack}>
                      {message.reactions.map((reaction) => (
                        <button
                          key={`${message.id}-${reaction.emoji}`}
                          type="button"
                          style={{
                            ...styles.reactionChip,
                            ...(reaction.reactedByCurrentUser ? styles.reactionChipActive : {}),
                          }}
                          data-testid={`message-reaction-${messageId}-${reaction.emoji}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onReactMessage?.(messageId, reaction.emoji);
                          }}
                        >
                          <span>{reaction.emoji}</span>
                          <span style={styles.reactionCount}>{reaction.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div style={styles.messageFooter}>
                    <span style={styles.messageTime}>{message.time}</span>
                    {isMe ? (
                      <span
                        style={styles.messageStatus}
                        data-testid={`message-status-${messageId}`}
                      >
                        {message.status === 'sent' ? (
                          <svg width="16" height="11" viewBox="0 0 16 11">
                            <path
                              d="M1 5.5 5.5 10 14.5 1"
                              stroke="#8e8e93"
                              strokeWidth="1.5"
                              fill="none"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : null}
                        {message.status === 'delivered' ? <Icons.DoubleCheck read={false} /> : null}
                        {message.status === 'read' ? <Icons.DoubleCheck read /> : null}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyingTo ? (
        <div style={styles.replyBar}>
          <div style={styles.replyContent}>
            <div style={styles.replyLine} />
            <div style={styles.replyTextGroup}>
              <span style={styles.replyName}>{replyingTo.sender === 'me' ? 'You' : chat.name}</span>
              {renderTextContent(replyingTo.text, `${getMessageId(replyingTo)}-reply-preview`, 'reply-preview')}
            </div>
          </div>
          <button style={styles.replyClose} onClick={() => setReplyingTo(null)}>
            ✕
          </button>
        </div>
      ) : null}
      {editingMessage ? (
        <div style={styles.replyPreview}>
          <div style={styles.replyBarIndicator} />
          <div style={styles.replyContent}>
            <span style={styles.replyUser}>Editing Message</span>
            <span style={styles.replyText}>{editingMessage.text}</span>
          </div>
          <button
            style={styles.replyClose}
            onClick={() => {
              setEditingMessage(null);
              setInputText('');
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      {isVoiceRecording || isSendingVoiceNote ? (
        <div style={styles.voiceRecorderBar} data-testid="voice-recorder-bar">
          <div style={styles.voiceRecorderMeta}>
            <span style={styles.voiceRecorderPulse} />
            <span style={styles.voiceRecorderLabel}>
              {isSendingVoiceNote ? 'Sending voice note…' : `Recording ${formatDuration(voiceRecordingDuration)}`}
            </span>
          </div>
          <div style={styles.voiceRecorderActions}>
            {!isSendingVoiceNote ? (
              <>
                <button
                  style={{ ...styles.voiceRecorderBtn, ...styles.voiceRecorderCancelBtn }}
                  data-testid="voice-recording-cancel-button"
                  onClick={() => finishVoiceRecording('discard')}
                >
                  Cancel
                </button>
                <button
                  style={{ ...styles.voiceRecorderBtn, ...styles.voiceRecorderSendBtn }}
                  data-testid="voice-recording-send-button"
                  onClick={() => finishVoiceRecording('send')}
                >
                  Send
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {composerNotice ? (
        <div style={styles.composerNotice}>
          <span style={styles.composerNoticeText}>{composerNotice}</span>
          <button style={styles.composerNoticeDismiss} onClick={() => setComposerNotice('')}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div style={styles.inputContainer}>
        <div style={styles.inputRow}>
          <button
            style={styles.inputBtn}
            data-testid="message-attachments-button"
            onClick={() => setShowAttachment(!showAttachment)}
            disabled={isVoiceRecording || isSendingVoiceNote}
          >
            <Icons.Plus />
          </button>
          <div style={styles.inputWrapper}>
            <button style={styles.emojiBtn} onClick={() => onEmojiClick?.()}>
              <Icons.Emoji />
            </button>
            <input
              type="text"
              placeholder="Message"
              data-testid="message-input"
              value={inputText}
              disabled={isVoiceRecording || isSendingVoiceNote}
              onChange={handleComposerChange}
              onBlur={() => onTypingStop?.()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                sendMessage();
              }}
              style={styles.input}
            />
            <button
              style={styles.cameraBtn}
              data-testid="composer-camera-button"
              onClick={openCameraCapture}
              disabled={isVoiceRecording || isSendingVoiceNote}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#8e8e93">
                <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
                <path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
              </svg>
            </button>
          </div>
          {inputText.trim() ? (
            <button style={styles.sendBtn} data-testid="message-send-button" onClick={sendMessage}>
              <Icons.Send />
            </button>
          ) : (
            <button
              style={styles.micBtn}
              data-testid="voice-record-button"
              onClick={startVoiceRecording}
              disabled={isVoiceRecording || isSendingVoiceNote}
            >
              <Icons.Mic />
            </button>
          )}
        </div>
      </div>

      {showAttachment ? (
        <div style={styles.attachOverlay} data-testid="attachments-overlay" onClick={() => setShowAttachment(false)}>
          <div style={styles.attachMenu} onClick={(event) => event.stopPropagation()}>
            <div style={styles.attachHandle} />
            <div style={styles.attachGrid}>
              {[
                { icon: '📄', label: 'Document', color: '#7B61FF', action: () => documentInputRef.current?.click() },
                { icon: '📷', label: 'Camera', color: '#FF2D55', action: openCameraCapture },
                { icon: '🖼️', label: 'Photos', color: '#AF52DE', action: () => galleryInputRef.current?.click() },
                { icon: '📍', label: 'Location', color: '#34C759', action: handleShareLocation },
                { icon: '👤', label: 'Contact', color: '#0A7CFF', action: handleShareContact },
                { icon: '📊', label: 'Poll', color: '#FF9500', action: handleCreatePoll },
              ].map((item) => (
                <div
                  key={item.label}
                  style={styles.attachItem}
                  data-testid={`attachment-option-${item.label.toLowerCase()}`}
                  onClick={item.action}
                >
                  <div style={{ ...styles.attachIcon, background: item.color }}>
                    <span style={{ fontSize: 24 }}>{item.icon}</span>
                  </div>
                  <span style={styles.attachLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showContactSheet ? (
        <div style={styles.modalOverlay} onClick={() => setShowContactSheet(false)}>
          <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeaderRow}>
              <span style={styles.modalTitle}>Share Contact</span>
              <button style={styles.modalClose} onClick={() => setShowContactSheet(false)}>
                Cancel
              </button>
            </div>
            <div style={styles.modalBody}>
              <input
                type="text"
                placeholder="Contact name"
                value={contactDraft.name}
                onChange={(event) =>
                  setContactDraft((previous) => ({ ...previous, name: event.target.value }))
                }
                style={styles.modalInput}
              />
              <input
                type="text"
                placeholder="Phone number"
                value={contactDraft.phone}
                onChange={(event) =>
                  setContactDraft((previous) => ({ ...previous, phone: event.target.value }))
                }
                style={styles.modalInput}
              />
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalPrimaryBtn} onClick={submitContactDraft}>
                Share
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPollSheet ? (
        <div style={styles.modalOverlay} onClick={() => setShowPollSheet(false)}>
          <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeaderRow}>
              <span style={styles.modalTitle}>Create Poll</span>
              <button style={styles.modalClose} onClick={() => setShowPollSheet(false)}>
                Cancel
              </button>
            </div>
            <div style={styles.modalBody}>
              <input
                type="text"
                placeholder="Poll question"
                value={pollDraft.question}
                onChange={(event) =>
                  setPollDraft((previous) => ({ ...previous, question: event.target.value }))
                }
                style={styles.modalInput}
              />
              <textarea
                placeholder="Options, separated by commas"
                value={pollDraft.options}
                onChange={(event) =>
                  setPollDraft((previous) => ({ ...previous, options: event.target.value }))
                }
                rows={4}
                style={{ ...styles.modalInput, minHeight: 96, resize: 'vertical' }}
              />
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalPrimaryBtn} onClick={submitPollDraft}>
                Send poll
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCameraCaptureOpen ? (
        <div style={styles.modalOverlay} data-testid="camera-capture-modal" onClick={closeCameraCapture}>
          <div style={styles.cameraCaptureCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.cameraCaptureHeader}>
              <button
                style={styles.cameraCaptureHeaderBtn}
                data-testid="camera-capture-close-button"
                onClick={closeCameraCapture}
              >
                Close
              </button>
              <span style={styles.cameraCaptureTitle}>
                {capturedMedia
                  ? capturedMedia.kind === 'video'
                    ? 'Preview video'
                    : 'Preview photo'
                  : isVideoRecording
                    ? `Recording ${formatDuration(videoRecordingDuration)}`
                    : 'Camera'}
              </span>
              <button
                style={styles.cameraCaptureHeaderBtn}
                data-testid="camera-capture-flip-button"
                onClick={() =>
                  setCameraFacingMode((previous) => (previous === 'environment' ? 'user' : 'environment'))
                }
                disabled={Boolean(capturedMedia) || isVideoRecording}
              >
                Flip
              </button>
            </div>

            <div style={styles.cameraCaptureStage}>
              {capturedMedia ? (
                capturedMedia.kind === 'video' ? (
                  <video
                    style={styles.cameraCapturePreview}
                    src={capturedMedia.url}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img style={styles.cameraCapturePreview} src={capturedMedia.url} alt="Captured media" />
                )
              ) : (
                <>
                  <video
                    ref={captureVideoRef}
                    style={styles.cameraCapturePreview}
                    autoPlay
                    playsInline
                    muted
                  />
                  {cameraCaptureState !== 'ready' ? (
                    <div style={styles.cameraCaptureOverlay}>
                      {cameraCaptureError || 'Opening camera…'}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div style={styles.cameraCaptureFooter}>
              {capturedMedia ? (
                <div style={styles.cameraCaptureActions}>
                  <button
                    style={{ ...styles.cameraCaptureActionBtn, ...styles.cameraCaptureSecondaryBtn }}
                    data-testid="camera-capture-retake-button"
                    onClick={retakeCapturedMedia}
                  >
                    Retake
                  </button>
                  <button
                    style={{ ...styles.cameraCaptureActionBtn, ...styles.cameraCapturePrimaryBtn }}
                    data-testid="camera-capture-send-button"
                    onClick={sendCapturedMedia}
                  >
                    Send
                  </button>
                </div>
              ) : (
                <div style={styles.cameraCaptureActions}>
                  <button
                    style={{ ...styles.cameraCaptureActionBtn, ...styles.cameraCaptureSecondaryBtn }}
                    data-testid="camera-capture-photo-button"
                    onClick={() => {
                      void capturePhoto();
                    }}
                    disabled={cameraCaptureState !== 'ready' || isVideoRecording}
                  >
                    Photo
                  </button>
                  <button
                    style={{
                      ...styles.cameraCaptureActionBtn,
                      ...(isVideoRecording ? styles.cameraCaptureDangerBtn : styles.cameraCapturePrimaryBtn),
                    }}
                    data-testid="camera-capture-video-button"
                    onClick={() => {
                      if (isVideoRecording) {
                        stopVideoRecording('preview');
                        return;
                      }

                      void startVideoRecording();
                    }}
                    disabled={cameraCaptureState !== 'ready' && !isVideoRecording}
                  >
                    {isVideoRecording ? 'Stop' : 'Record video'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {fullscreenImage ? (
        <div style={styles.imageViewerOverlay} data-testid="image-viewer-modal" onClick={() => setFullscreenImage(null)}>
          <button
            type="button"
            style={styles.imageViewerClose}
            data-testid="image-viewer-close-button"
            onClick={() => setFullscreenImage(null)}
          >
            Done
          </button>
          <img
            style={styles.imageViewerImage}
            src={fullscreenImage.src}
            alt={fullscreenImage.alt}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      {activeReactionMessageId && primarySelectedMessage ? (
        <div
          style={{
            ...styles.contextReactionDock,
            top: selectedMessageAnchor.top,
            left: selectedMessageAnchor.left,
          }}
          data-testid="message-context-menu"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            style={{
              ...styles.reactions,
              ...(selectedMessageAnchor.placement === 'below' ? styles.reactionsBelow : {}),
            }}
          >
            {QUICK_REACTIONS.map((emoji) => {
              const isActive = primarySelectedMessage.reactions?.some(
                (reaction) => reaction.emoji === emoji && reaction.reactedByCurrentUser,
              );

              return (
                <button
                  key={emoji}
                  style={{ ...styles.reactionBtn, ...(isActive ? styles.reactionBtnActive : {}) }}
                  data-testid={`reaction-button-${emoji}`}
                  onClick={() => {
                    onReactMessage?.(getMessageId(primarySelectedMessage), emoji);
                    closeReactionMenu();
                  }}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative',
    background:
      'linear-gradient(180deg, #0a1014 0%, #0b141a 52%, #0d171d 100%)',
  },
  hiddenInput: { display: 'none' },
  header: {
    display: 'grid',
    gridTemplateColumns: '42px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: 'linear-gradient(180deg, rgba(17,27,33,0.96) 0%, rgba(18,29,35,0.92) 100%)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    minHeight: 60,
    flexShrink: 0,
    backdropFilter: 'blur(20px)',
    boxShadow: '0 12px 30px rgba(0,0,0,0.26)',
  },
  backBtn: {
    width: 42,
    height: 42,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(32,44,51,0.96)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 21,
    cursor: 'pointer',
    padding: 0,
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
  },
  backText: { color: '#0A7CFF', fontSize: 17 },
  headerCenter: { minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'linear-gradient(135deg, #1f6f66 0%, #2f5fa7 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 24px rgba(17,27,33,0.3)',
  },
  headerInfo: { display: 'flex', flexDirection: 'column', minWidth: 0, justifyContent: 'center' },
  headerName: {
    color: '#f7f9fa',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: '20px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  headerStatus: {
    color: '#93a1aa',
    fontSize: 12,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  headerActions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  headerBtn: {
    width: 40,
    height: 40,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(32,44,51,0.96)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 20,
    cursor: 'pointer',
    padding: 0,
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
  },
  selectionHeaderInfo: { minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  selectionHeaderTitle: { color: '#f7f9fa', fontSize: 16, fontWeight: '700', lineHeight: '20px' },
  selectionHeaderSubtitle: {
    color: '#93a1aa',
    fontSize: 12,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  selectionHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    overflowX: 'auto',
    paddingLeft: 8,
  },
  selectionActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(32,44,51,0.96)',
    color: '#d7dee2',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
  },
  selectionActionBtnDanger: { color: '#FF3B30' },
  selectionActionIcon: { fontSize: 16, lineHeight: 1 },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 12px 20px',
    WebkitOverflowScrolling: 'touch',
    background:
      'radial-gradient(circle at top left, rgba(18,140,126,0.12), transparent 0 28%), radial-gradient(circle at bottom right, rgba(10,124,255,0.08), transparent 0 26%), linear-gradient(180deg, #0b141a 0%, #111b21 100%)',
  },
  loadingText: { color: '#93a1aa', fontSize: 13, textAlign: 'center', padding: '8px 0' },
  encryptionNotice: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 16px',
    marginBottom: 8,
    background: 'rgba(32,44,51,0.88)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 14,
  },
  encryptionText: { color: '#93a1aa', fontSize: 11, textAlign: 'center', lineHeight: '14px' },
  dateSeparator: { display: 'flex', justifyContent: 'center', margin: '8px 0 12px' },
  dateText: {
    background: 'rgba(32,44,51,0.86)',
    color: '#b3bdc4',
    fontSize: 12,
    fontWeight: '600',
    padding: '4px 12px',
    borderRadius: 999,
    letterSpacing: 0.5,
    border: '1px solid rgba(255,255,255,0.04)',
  },
  messageRow: { display: 'flex', width: '100%', marginBottom: 10, position: 'relative' },
  messageSwipeTrack: { position: 'relative', display: 'contents', alignItems: 'center', maxWidth: '84%' },
  swipeReplyCue: {
    position: 'absolute',
    top: '50%',
    left: -38,
    width: 28,
    height: 28,
    borderRadius: 14,
    background: 'rgba(32,44,51,0.96)',
    color: '#25d366',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: '700',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
    pointerEvents: 'none',
  },
  bubble: {
    padding: '10px 12px 8px',
    position: 'relative',
    boxShadow: '0 14px 28px rgba(0,0,0,0.22)',
    border: '1px solid rgba(255,255,255,0.04)',
    willChange: 'transform',
  },
  outgoingBubble: { background: '#144d37', color: '#eaf7f1' },
  incomingBubble: { background: '#202c33', color: '#e9edef' },
  mediaBubble: {
    padding: 6,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  outgoingMediaBubble: { background: '#144d37' },
  incomingMediaBubble: { background: '#202c33' },
  senderName: { color: '#7dd6c3', fontSize: 12, fontWeight: '700', display: 'block', marginBottom: 4, letterSpacing: 0.2 },
  textContentBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0 },
  messageText: { color: 'inherit', fontSize: 16, lineHeight: '22px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  messageTextClamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 10,
    overflow: 'hidden',
  },
  messageFooter: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  messageTime: { color: 'rgba(233,237,239,0.58)', fontSize: 11, fontWeight: '500' },
  messageStatus: { display: 'flex', alignItems: 'center' },
  imagePlaceholder: {
    width: 200,
    height: 150,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  mediaImageBtn: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  },
  mediaImage: {
    width: '100%',
    maxWidth: 264,
    borderRadius: 18,
    display: 'block',
    objectFit: 'cover',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  mediaCard: { display: 'flex', flexDirection: 'column', gap: 8 },
  mediaVideo: {
    width: '100%',
    maxWidth: 264,
    borderRadius: 18,
    display: 'block',
    background: '#000',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  mediaAudio: { width: '100%', minWidth: 250, },
  mediaCaptionBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '0 2px 4px', minWidth: 0 },
  mediaCaption: { color: '#e9edef', fontSize: 14, lineHeight: '19px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  voiceMessageCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 220,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.04)',
  },
  voiceMessageGlyph: {
    width: 42,
    height: 42,
    borderRadius: 21,
    background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
  },
  voiceMessageBody: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 },
  voiceMessageTitle: { color: '#f7f9fa', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  pollCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: '10px 12px',
    marginBottom: 4,
    border: '1px solid rgba(255,255,255,0.04)',
  },
  pollTitle: { color: '#f7f9fa', fontSize: 14, fontWeight: '600' },
  pollMeta: { color: 'rgba(233,237,239,0.6)', fontSize: 12 },
  documentCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: '10px 12px',
    marginBottom: 4,
    textDecoration: 'none',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  documentTitle: { color: '#f7f9fa', fontSize: 14, fontWeight: '600' },
  documentMeta: { color: 'rgba(233,237,239,0.6)', fontSize: 12 },
  replyBubble: {
    background: 'rgba(255,255,255,0.06)',
    borderLeft: '3px solid #25d366',
    borderRadius: 12,
    padding: '7px 10px',
    marginBottom: 6,
  },
  replyBubbleText: { color: '#c6d1d6', fontSize: 13, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  replyTextClamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  reactionStack: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
  reactionChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(11,20,26,0.42)',
    color: '#e9edef',
    fontSize: 12,
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(0,0,0,0.18)',
  },
  reactionChipActive: {
    background: 'rgba(37,211,102,0.14)',
    border: '1px solid rgba(37,211,102,0.28)',
    color: '#8ef0b8',
  },
  selectedBubble: {
    border: '1px solid rgba(142,240,184,0.26)',
    boxShadow: '0 0 0 2px rgba(37,211,102,0.12), 0 18px 30px rgba(0,0,0,0.28)',
    filter: 'saturate(1.06)',
  },
  reactionCount: { color: 'inherit', fontSize: 12, fontWeight: '700' },
  replyBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: 'rgba(18,28,34,0.98)',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  replyContent: { display: 'flex', flex: 1, gap: 8, alignItems: 'center' },
  replyTextGroup: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  replyLine: { width: 3, height: 30, background: '#25d366', borderRadius: 2 },
  replyName: { color: '#8ef0b8', fontSize: 13, fontWeight: '600', display: 'block' },
  replyTextPreview: { color: '#93a1aa', fontSize: 14, lineHeight: '18px', display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  replyClose: { background: 'none', border: 'none', color: '#93a1aa', fontSize: 18, cursor: 'pointer', padding: '4px 8px' },
  readMoreBtn: {
    background: 'none',
    border: 'none',
    color: '#8ef0b8',
    fontSize: 12,
    fontWeight: '700',
    padding: 0,
    cursor: 'pointer',
    letterSpacing: 0.1,
  },
  voiceRecorderBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 14px',
    background: 'rgba(18,28,34,0.98)',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  voiceRecorderMeta: { display: 'flex', alignItems: 'center', gap: 10 },
  voiceRecorderPulse: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: '#FF3B30',
    boxShadow: '0 0 0 6px rgba(255,59,48,0.16)',
  },
  voiceRecorderLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  voiceRecorderActions: { display: 'flex', alignItems: 'center', gap: 8 },
  voiceRecorderBtn: {
    border: 'none',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: '600',
    cursor: 'pointer',
  },
  voiceRecorderCancelBtn: { background: 'rgba(255,255,255,0.08)', color: '#fff' },
  voiceRecorderSendBtn: { background: '#0A7CFF', color: '#fff' },
  composerNotice: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 14px',
    background: 'rgba(73,49,13,0.96)',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    flexShrink: 0,
  },
  composerNoticeText: { color: '#ffe0a3', fontSize: 13, lineHeight: '18px' },
  composerNoticeDismiss: {
    background: 'none',
    border: 'none',
    color: '#ffd38b',
    fontSize: 12,
    fontWeight: '700',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputContainer: {
    padding: '8px 10px',
    paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
    background: 'linear-gradient(180deg, rgba(17,27,33,0.98) 0%, rgba(18,28,34,0.98) 100%)',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
    backdropFilter: 'blur(18px)',
  },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  inputBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'rgba(32,44,51,0.96)',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
  },
  inputWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    background: '#202c33',
    borderRadius: 23,
    padding: '0 6px 0 8px',
    minHeight: 46,
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
  },
  emojiBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    height: 42,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#f7f9fa',
    fontSize: 16,
    padding: '0 8px',
    lineHeight: '22px',
  },
  cameraBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 12px 24px rgba(18,140,126,0.3)',
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'rgba(32,44,51,0.96)',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
  },
  attachOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'flex-end',
    animation: 'fadeIn 0.2s ease',
  },
  attachMenu: {
    width: '100%',
    background: '#2A2A2E',
    borderRadius: '16px 16px 0 0',
    padding: '12px 16px',
    paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
    animation: 'slideUp 0.3s ease',
  },
  attachHandle: { width: 36, height: 5, background: 'rgba(255,255,255,0.3)', borderRadius: 3, margin: '0 auto 20px' },
  attachGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 },
  attachItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' },
  attachIcon: { width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  attachLabel: { color: '#8e8e93', fontSize: 12, fontWeight: '500' },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(8px)',
    zIndex: 110,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    background: '#1F2C34',
    borderRadius: 24,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  },
  modalHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  modalClose: {
    background: 'none',
    border: 'none',
    color: '#0A7CFF',
    fontSize: 15,
    cursor: 'pointer',
  },
  modalBody: { display: 'grid', gap: 12, padding: 18 },
  modalInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    color: '#fff',
    fontSize: 15,
    padding: '12px 14px',
    outline: 'none',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '0 18px 18px',
  },
  modalPrimaryBtn: {
    background: '#0A7CFF',
    border: 'none',
    color: '#fff',
    borderRadius: 999,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: '600',
    cursor: 'pointer',
  },
  cameraCaptureCard: {
    width: '100%',
    maxWidth: 460,
    background: '#101316',
    borderRadius: 28,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 24px 70px rgba(0,0,0,0.4)',
  },
  cameraCaptureHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  cameraCaptureHeaderBtn: {
    background: 'none',
    border: 'none',
    color: '#8bd1ff',
    fontSize: 14,
    fontWeight: '600',
    cursor: 'pointer',
  },
  cameraCaptureTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cameraCaptureStage: {
    position: 'relative',
    background: '#000',
    aspectRatio: '9 / 16',
    maxHeight: '70vh',
    minHeight: 320,
  },
  cameraCapturePreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    background: '#000',
  },
  cameraCaptureOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    textAlign: 'center',
    color: '#fff',
    fontSize: 14,
    background: 'rgba(0,0,0,0.42)',
  },
  cameraCaptureFooter: {
    padding: '16px 18px 18px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: '#101316',
  },
  cameraCaptureActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  cameraCaptureActionBtn: {
    minWidth: 128,
    border: 'none',
    borderRadius: 999,
    padding: '12px 18px',
    fontSize: 14,
    fontWeight: '700',
    cursor: 'pointer',
  },
  cameraCapturePrimaryBtn: { background: '#0A7CFF', color: '#fff' },
  cameraCaptureSecondaryBtn: { background: 'rgba(255,255,255,0.08)', color: '#fff' },
  cameraCaptureDangerBtn: { background: '#FF3B30', color: '#fff' },
  contextReactionDock: {
    position: 'absolute',
    width: 'min(296px, calc(100vw - 32px))',
    zIndex: 120,
    pointerEvents: 'auto',
  },
  reactions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    background: 'rgba(24,34,40,0.98)',
    borderRadius: 999,
    padding: 6,
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 18px 34px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(20px)',
  },
  reactionsBelow: { boxShadow: '0 14px 28px rgba(0,0,0,0.24)' },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'transparent',
    border: 'none',
    fontSize: 23,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBtnActive: { background: 'rgba(37,211,102,0.14)', boxShadow: 'inset 0 0 0 1px rgba(37,211,102,0.2)' },
  imageViewerOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 130,
    background: 'rgba(10,15,20,0.96)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  imageViewerClose: {
    position: 'absolute',
    top: 18,
    right: 18,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#fff',
    borderRadius: 999,
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: '700',
    cursor: 'pointer',
  },
  imageViewerImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: 22,
    boxShadow: '0 28px 60px rgba(0,0,0,0.4)',
  },
};
