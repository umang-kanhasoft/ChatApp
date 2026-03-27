import { useEffect, useMemo, useState } from 'react';

const isRunningStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    setIsStandalone(isRunningStandalone());

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const isIos = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua);
  }, []);

  if (isStandalone || dismissed) return null;

  if (deferredPrompt) {
    return (
      <div className="fixed bottom-3 left-1/2 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2 rounded-xl border border-[#d1d7db] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
        <p className="text-[14px] font-medium text-[#111b21]">Install ChatApp on your device</p>
        <p className="mt-0.5 text-[12px] text-[#667781]">Use it like a native app from your home screen.</p>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[12px] text-[#54656f]"
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
          <button
            type="button"
            className="rounded-md bg-[#00a884] px-3 py-1.5 text-[12px] font-semibold text-white"
            onClick={async () => {
              deferredPrompt.prompt();
              await deferredPrompt.userChoice.catch(() => null);
              setDeferredPrompt(null);
            }}
          >
            Install
          </button>
        </div>
      </div>
    );
  }

  if (isIos) {
    return (
      <div className="fixed bottom-3 left-1/2 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2 rounded-xl border border-[#d1d7db] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
        <p className="text-[14px] font-medium text-[#111b21]">Install ChatApp</p>
        <p className="mt-0.5 text-[12px] text-[#667781]">In Safari tap Share, then Add to Home Screen.</p>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[12px] text-[#54656f]"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return null;
}
