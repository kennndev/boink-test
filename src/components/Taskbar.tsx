import { Button } from "@/components/ui/button";
import connectIcon from "@/assets/connect.png";
import windowsIcon from "@/assets/windows98.svg";
import xIcon from "@/assets/x.svg";
import discordIcon from "@/assets/discord.svg";
import githubIcon from "@/assets/github.svg";
import { useState, useEffect, useRef } from "react";

interface TaskbarProps {
  onStartClick: () => void;
  onConnectWalletClick: () => void;
  onDisconnectWallet?: () => void;
  connectedWallet: string | null;
  blockNumber: string;
}

export const Taskbar = ({ onStartClick, onConnectWalletClick, onDisconnectWallet, connectedWallet, blockNumber }: TaskbarProps) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const menuRef = useRef<HTMLDivElement>(null);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMobileMenu(false);
      }
    };

    if (showMobileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showMobileMenu]);

  return (
    <div className="fixed bottom-0 left-0 right-0 h-11 sm:h-12 bg-secondary win98-border flex items-center px-1 gap-1 z-50 overflow-visible whitespace-nowrap box-border pb-[env(safe-area-inset-bottom)]">
      {/* Start Button */}
      <Button
        onClick={onStartClick}
        variant="secondary"
        className="h-8 sm:h-9 px-2 sm:px-3 font-bold win98-border hover:win98-border-inset flex items-center gap-1 sm:gap-2 shrink-0"
      >
        <img src={windowsIcon} alt="Windows" className="w-4 h-4 sm:w-6 sm:h-6" />
        <span className="font-military text-xs sm:text-sm">Start</span>
      </Button>

      {/* Connect/Disconnect Wallet */}
      {connectedWallet ? (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            onClick={onConnectWalletClick}
            variant="secondary"
            className="h-8 sm:h-9 px-2 sm:px-3 win98-border hover:win98-border-inset flex items-center gap-1 sm:gap-2 font-bold shrink-0"
          >
            <img src={connectIcon} alt="Connected" className="w-4 h-4 sm:w-6 sm:h-6" />
            <span className="font-cyber text-xs sm:text-sm max-w-[44vw] sm:max-w-none truncate">
              Connected: {connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)}
            </span>
          </Button>
          {onDisconnectWallet && (
            <Button
              onClick={onDisconnectWallet}
              variant="secondary"
              className="h-8 sm:h-9 px-2 sm:px-2 win98-border hover:win98-border-inset hover:bg-red-100 hover:border-red-400 flex items-center justify-center font-bold shrink-0"
              title="Disconnect Wallet"
            >
              <span className="text-red-600 font-bold text-xs sm:text-sm">✕</span>
            </Button>
          )}
        </div>
      ) : (
        <Button
          onClick={onConnectWalletClick}
          variant="secondary"
          className="h-8 sm:h-9 px-2 sm:px-3 win98-border hover:win98-border-inset flex items-center gap-1 sm:gap-2 font-bold shrink-0"
        >
          <img src={connectIcon} alt="Connect" className="w-4 h-4 sm:w-6 sm:h-6" />
          <span className="font-cyber text-xs sm:text-sm max-w-[44vw] sm:max-w-none truncate">
            Connect Wallet
          </span>
        </Button>
      )}


      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Desktop: Show all elements */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {/* Language Dropdown */}
        <Button
          variant="secondary"
          className="h-8 sm:h-9 px-2 sm:px-3 win98-border hover:win98-border-inset items-center gap-1 font-bold shrink-0"
        >
          <span className="font-retro text-xs sm:text-sm">English</span>
          <svg className="w-2 h-2 sm:w-3 sm:h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 8L2 4h8l-4 4z"/>
          </svg>
        </Button>

        {/* Social Icons */}
        <div className="flex gap-1 items-center px-2">
          {/* X Icon */}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 sm:h-8 sm:w-8 p-0 win98-border hover:win98-border-inset flex items-center justify-center shrink-0"
            onClick={() => window.open('https://x.com/boinknfts', '_blank')}
          >
            <img src={xIcon} alt="X" className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
          
          {/* Discord Icon */}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 sm:h-8 sm:w-8 p-0 win98-border hover:win98-border-inset flex items-center justify-center shrink-0"
          >
            <img src={discordIcon} alt="Discord" className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
          
          {/* GitHub Icon */}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 sm:h-8 sm:w-8 p-0 win98-border hover:win98-border-inset flex items-center justify-center shrink-0"
          >
            <img src={githubIcon} alt="GitHub" className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
        </div>

         {/* Current Time */}
        <div className="h-8 sm:h-9 px-2 sm:px-3 win98-border-inset flex items-center gap-1 sm:gap-2 shrink-0">
          <span className="text-xs font-pixel text-gray-600">{currentTime.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Mobile: 3-dots menu */}
      <div className="sm:hidden relative shrink-0 z-[55]" ref={menuRef}>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowMobileMenu(!showMobileMenu);
          }}
          className="h-8 w-8 p-0 win98-border hover:win98-border-inset flex items-center justify-center shrink-0 pointer-events-auto bg-gray-300"
        >
          <svg className="w-4 h-4 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </button>

        {/* Mobile Dropdown Menu */}
        {showMobileMenu && (
          <div className="absolute bottom-full right-0 mb-1 bg-gray-300 win98-border p-2 min-w-[200px] max-w-[90vw] z-[60] pointer-events-auto shadow-lg">
            {/* Language Dropdown */}
            <div className="mb-2">
              <Button
                variant="secondary"
                className="w-full h-8 px-2 win98-border hover:win98-border-inset items-center gap-1 font-bold justify-between"
                onClick={() => setShowMobileMenu(false)}
              >
                <span className="font-retro text-xs">English</span>
                <svg className="w-2 h-2" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 8L2 4h8l-4 4z"/>
                </svg>
              </Button>
            </div>

            {/* Social Icons */}
            <div className="mb-2">
              <div className="text-xs font-military mb-1 text-gray-700">Social Links</div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 w-6 p-0 win98-border hover:win98-border-inset flex items-center justify-center"
                  onClick={() => {
                    window.open('https://x.com/boinknfts', '_blank');
                    setShowMobileMenu(false);
                  }}
                >
                  <svg className="w-3 h-3 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 w-6 p-0 win98-border hover:win98-border-inset flex items-center justify-center"
                  onClick={() => {
                    window.open('https://discord.gg', '_blank');
                    setShowMobileMenu(false);
                  }}
                >
                  <img src={discordIcon} alt="Discord" className="w-3 h-3" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 w-6 p-0 win98-border hover:win98-border-inset flex items-center justify-center"
                  onClick={() => {
                    window.open('https://github.com', '_blank');
                    setShowMobileMenu(false);
                  }}
                >
                  <img src={githubIcon} alt="GitHub" className="w-3 h-3" />
                </Button>
              </div>
            </div>

                  {/* Current Time */}
            <div className="h-6 px-2 win98-border-inset flex items-center gap-1 text-black">
              <span className="text-xs font-pixel text-gray-600">{currentTime.toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
