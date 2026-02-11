import { useState, useEffect, useRef } from "react";
import { getUser } from "@/lib/api";
import windowsIcon from "@/assets/windows98.svg";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StartMenuProps {
  connectedWallet: string | null;
  onClose: () => void;
  isOpen?: boolean;
}

export const StartMenu = ({ connectedWallet, onClose, isOpen = true }: StartMenuProps) => {
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load user points when wallet is connected or menu is opened
  useEffect(() => {
    if (connectedWallet && isOpen) {
      setIsLoading(true);
      getUser(connectedWallet)
        .then((userData) => {
          console.log('User data fetched:', userData); // Debug log
          if (userData) {
            setUserPoints(userData.points);
          } else {
            console.warn('No user data returned for wallet:', connectedWallet);
          }
        })
        .catch((error) => {
          console.error('Error loading user points:', error);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!connectedWallet) {
      setUserPoints(null);
    }
  }, [connectedWallet, isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed bottom-12 sm:bottom-14 left-0 bg-gray-300 win98-border shadow-2xl z-[100] min-w-[250px] sm:min-w-[300px]"
    >
      {/* Menu Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img 
            src={windowsIcon} 
            alt="Windows" 
            className="w-6 h-6 sm:w-8 sm:h-8"
          />
          <span className="font-bold font-military text-sm sm:text-base">Start Menu</span>
        </div>
        <Button
          size="icon"
          variant="secondary"
          className="h-5 w-5 sm:h-6 sm:w-6 p-0 win98-border hover:bg-red-500 hover:text-white flex-shrink-0"
          onClick={onClose}
        >
          <X className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </div>

      {/* Menu Content - Only Points */}
      <div className="p-4 sm:p-6">
        <div className="win98-border-inset p-4 sm:p-6 bg-gradient-to-r from-yellow-100 to-yellow-50">
          <div className="flex flex-col items-center justify-center space-y-3">
            <span className="text-base sm:text-lg font-pixel text-gray-700">💰 Total Points</span>
            {isLoading ? (
              <span className="text-sm font-retro text-gray-500">Loading...</span>
            ) : (
              <span className="text-4xl sm:text-5xl font-bold font-military text-gradient-yellow">
                {connectedWallet ? (userPoints !== null ? userPoints : 0) : '---'}
              </span>
            )}
            {!connectedWallet && (
              <p className="text-xs sm:text-sm font-retro text-gray-500 text-center mt-2">
                Connect your wallet to see your points
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
