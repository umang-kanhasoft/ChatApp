import { useMemo, useState } from 'react';
import { Phone, Video, MoreVertical, ChevronLeft } from 'lucide-react';
import WhatsAppPopupMenu from './WhatsAppPopupMenu.jsx';

function IconPhone() {
  return <Phone className="block h-[18px] w-[18px]" strokeWidth={1.9} />;
}

function IconVideo() {
  return <Video className="block h-[18px] w-[18px]" strokeWidth={1.9} />;
}

function IconDots() {
  return <MoreVertical className="block h-[18px] w-[18px]" strokeWidth={2.1} />;
}

function IconBack() {
  return (
    <div className="flex items-center -ml-1">
      <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />
    </div>
  );
}

function ActionButton({
  title,
  onClick,
  disabled = false,
  children,
  buttonClassName = '',
  iconClassName = '',
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-10 w-10 shrink-0 appearance-none items-center justify-center rounded-full p-0 transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
        buttonClassName,
      ].join(' ')}
    >
      <span className={['pointer-events-none flex h-full w-full items-center justify-center leading-none', iconClassName].join(' ')}>
        {children}
      </span>
    </button>
  );
}

export default function ChatHeader({
  title,
  subtitle,
  avatarUrl,
  isGroup = false,
  onVoiceCall,
  onVideoCall,
  onToggleBlock,
  isPeerBlocked = false,
  searchInput,
  onSearchInputChange,
  onSearchSubmit,
  onSearchClear,
  isSearchActive = false,
  onBack,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const menuItems = useMemo(
    () => [
      { key: 'view-contact', label: 'View Contact', disabled: true },
      { key: 'media-links', label: 'Media, links, and docs', disabled: true },
      { key: 'web', label: 'Whatsapp Web', disabled: true },
      {
        key: 'search',
        label: 'Search',
        onSelect: () => {
          setIsSearchOpen(true);
        },
      },
      { key: 'mute', label: 'Mute Notification', disabled: true },
      { key: 'wallpaper', label: 'Wallpaper', disabled: true },
      {
        key: 'block',
        label: isPeerBlocked ? 'Unblock user' : 'Block user',
        onSelect: onToggleBlock,
        disabled: !onToggleBlock,
      },
    ],
    [isPeerBlocked, onToggleBlock],
  );

  const shouldShowSearch = isSearchOpen || isSearchActive;

  return (
    <header className="shrink-0 bg-[#F6F6F6] text-[#000000] border-b border-[#D8D8D8]">
      <div className="relative flex h-[54px] items-center px-1.5">
        <div className="flex min-w-0 items-center overflow-hidden">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="group flex flex-none items-center text-[#007AFF] hover:bg-black/5 rounded-lg p-1 transition-colors focus:outline-none"
            >
              <IconBack />
            </button>
          ) : null}

          <div className="flex min-w-0 flex-1 items-center gap-2.5 ml-0.5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={title}
                className="h-[36px] w-[36px] shrink-0 rounded-full object-cover shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                loading="lazy"
              />
            ) : (
              <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-[#8fa1ad]">
                <img
                  src={isGroup ? '/groups.svg' : '/person.svg'}
                  alt={isGroup ? 'Group avatar' : 'User avatar'}
                  className="h-[18px] w-[18px]"
                />
              </span>
            )}

            <div className="min-w-0 flex flex-col justify-center overflow-hidden pr-2">
              <h3 className="truncate text-[16px] font-semibold leading-[0.7] tracking-tight text-[#000000]">
                {title}
              </h3>
              <p className="truncate text-[12px] leading-[0.7] text-[#8E8E93] mt-[-7px]">
                {subtitle || 'tap here for contact info'}
              </p>
            </div>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ActionButton
            title="Video call"
            onClick={onVideoCall}
            disabled={!onVideoCall}
            buttonClassName="border-transparent hover:bg-black/5"
            iconClassName="text-[#007AFF]"
          >
            <IconVideo />
          </ActionButton>
          <ActionButton
            title="Voice call"
            onClick={onVoiceCall}
            disabled={!onVoiceCall}
            buttonClassName="border-transparent hover:bg-black/5"
            iconClassName="text-[#007AFF]"
          >
            <IconPhone />
          </ActionButton>
          <ActionButton
            title="More"
            onClick={() => setIsMenuOpen((value) => !value)}
            buttonClassName="border-transparent hover:bg-black/5"
            iconClassName="text-[#007AFF]"
          >
            <IconDots />
          </ActionButton>
        </div>

        <WhatsAppPopupMenu
          isOpen={isMenuOpen}
          items={menuItems}
          onClose={() => setIsMenuOpen(false)}
        />
      </div>

      {shouldShowSearch ? (
        <form
          className="flex items-center gap-2 border-t border-black/10 bg-[#128c7e] px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchSubmit?.();
          }}
        >
          <input
            value={searchInput}
            onChange={(event) => onSearchInputChange?.(event.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-[18px] border-none bg-white px-4 text-[14px] text-[#111b21] outline-none placeholder:text-[#90979c]"
          />
          <button
            type="submit"
            className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-[#075e54]"
          >
            Go
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-[13px] text-white"
            onClick={() => {
              setIsSearchOpen(false);
              onSearchClear?.();
            }}
          >
            Close
          </button>
        </form>
      ) : null}
    </header>
  );
}
