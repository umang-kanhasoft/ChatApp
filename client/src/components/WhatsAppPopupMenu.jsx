import { useEffect, useRef } from 'react';

export default function WhatsAppPopupMenu({
  isOpen,
  items,
  onClose,
  className = '',
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      onClose?.();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={[
        'absolute right-2 top-full z-50 mt-1 min-w-[196px] max-w-[calc(100%-24px)] overflow-hidden rounded-sm bg-white py-1 text-[#111b21] shadow-[0_6px_18px_rgba(0,0,0,0.28)] ring-1 ring-black/8',
        className,
      ].join(' ')}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          disabled={item.disabled}
          className={[
            'flex w-full appearance-none items-center justify-between border-0 bg-transparent px-4 py-2.5 text-left text-[15px] leading-6',
            item.danger ? 'text-[#d93025]' : 'text-[#111b21]',
            item.disabled ? 'cursor-not-allowed text-[#a0a7ab]' : 'hover:bg-[#f5f5f5]',
          ].join(' ')}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect?.();
            onClose?.();
          }}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
