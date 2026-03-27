import { useMemo, useState } from 'react';
import './App.css';
import CallsTab from './components/CallsTab.jsx';
import ChatScreen from './components/ChatScreen.jsx';
import ChatsTab from './components/ChatsTab.jsx';
import CommunitiesTab from './components/CommunitiesTab.jsx';
import ContactInfo from './components/ContactInfo.jsx';
import SettingsTab from './components/SettingsTab.jsx';
import StatusViewer from './components/StatusViewer.jsx';
import TabBar from './components/TabBar.jsx';
import UpdatesTab from './components/UpdatesTab.jsx';

export default function ChatUiApp({
  currentUser,
  chats = [],
  contacts = [],
  activeChat = null,
  messages = [],
  isMessagesLoading = false,
  statusUpdates = [],
  callHistory = [],
  onOpenChat,
  onCloseChat,
  onSendMessage,
  onSendPoll,
  onUploadFile,
  onStartCall,
  onStartCallFromHistory,
  onMarkChatRead,
  onStartManualChat,
  onCreateGroup,
  onViewStatus,
  onTypingStart,
  onTypingStop,
  typingLabel = '',
  currentCall = null,
  onEditMessage,
  onDeleteMessage,
  onForwardMessage,
  onStarMessage,
  onPinMessage,
  onReactMessage,
  onEmojiClick,
  onMicClick,
  onStatusReply,
  onAddStatus,
  onNewCall,
  onCreateCallLink,
  onLogout,
  callOverlay = null,
  settingsVersion = 'WhatsApp Clone',
}) {
  const [activeTab, setActiveTab] = useState('chats');
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [viewingStatus, setViewingStatus] = useState(null);

  const unreadChatsCount = useMemo(
    () => chats.reduce((sum, chat) => sum + Number(chat.unread || 0), 0),
    [chats],
  );

  const handleBackFromChat = () => {
    setShowContactInfo(false);
    onCloseChat?.();
  };

  const handleOpenContactInfo = () => {
    setShowContactInfo(true);
  };

  const handleCloseContactInfo = () => {
    setShowContactInfo(false);
  };

  const handleViewStatus = (status) => {
    onViewStatus?.(status);
    setViewingStatus(status);
  };

  const handleCloseStatus = () => {
    setViewingStatus(null);
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'updates':
        return (
          <UpdatesTab
            currentUser={currentUser}
            statuses={statusUpdates}
            onViewStatus={handleViewStatus}
            onAddStatus={onAddStatus}
          />
        );
      case 'calls':
        return (
          <CallsTab
            callHistory={callHistory}
            onOpenChat={onOpenChat}
            onStartCall={onStartCallFromHistory}
            onNewCall={onNewCall}
            onCreateCallLink={onCreateCallLink}
          />
        );
      case 'communities':
        return <CommunitiesTab />;
      case 'chats':
        return (
          <ChatsTab
            chats={chats}
            contacts={contacts}
            onOpenChat={(chat) => {
              onOpenChat?.(chat);
              onMarkChatRead?.(chat.id);
            }}
            onStartManualChat={onStartManualChat}
            onCreateGroup={onCreateGroup}
          />
        );
      case 'settings':
        return <SettingsTab currentUser={currentUser} onLogout={onLogout} versionLabel={settingsVersion} />;
      default:
        return (
          <ChatsTab
            chats={chats}
            contacts={contacts}
            onOpenChat={(chat) => {
              onOpenChat?.(chat);
              onMarkChatRead?.(chat.id);
            }}
            onStartManualChat={onStartManualChat}
            onCreateGroup={onCreateGroup}
          />
        );
    }
  };

  return (
    <div className="chat-ui-root">
      <div className="app-root">
        <div className="main-content">
          {activeChat ? (
            showContactInfo ? (
              <ContactInfo chat={activeChat} onBack={handleCloseContactInfo} onStartCall={onStartCall} />
            ) : (
              <ChatScreen
                chat={activeChat}
                messages={messages}
                isLoading={isMessagesLoading}
                typingLabel={typingLabel}
                currentCall={currentCall}
                onBack={handleBackFromChat}
                onOpenContactInfo={handleOpenContactInfo}
                onSendMessage={onSendMessage}
                onSendPoll={onSendPoll}
                onUploadFile={onUploadFile}
                onStartCall={onStartCall}
                onTypingStart={onTypingStart}
                onTypingStop={onTypingStop}
                onEditMessage={onEditMessage}
                onDeleteMessage={onDeleteMessage}
                onForwardMessage={onForwardMessage}
                onStarMessage={onStarMessage}
                onPinMessage={onPinMessage}
                onReactMessage={onReactMessage}
                onEmojiClick={onEmojiClick}
                onMicClick={onMicClick}
              />
            )
          ) : (
            <>
              <div className="tab-content">{renderActiveTab()}</div>
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} chatsBadge={unreadChatsCount} />
            </>
          )}
        </div>

        {viewingStatus ? (
        <StatusViewer status={viewingStatus} onClose={handleCloseStatus} onReply={onStatusReply} />
      ) : null}
        {callOverlay}
      </div>
    </div>
  );
}
