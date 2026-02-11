import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

interface WalletConnectModalProps {
  onClose: () => void;
  onConnect: (provider: any) => void;
  projectId: string;
}

export const WalletConnectModal = ({ onClose, onConnect, projectId }: WalletConnectModalProps) => {
  const [qrCodeUri, setQrCodeUri] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    initWalletConnect();
  }, []);

  const initWalletConnect = async () => {
    try {
      setIsConnecting(true);
      
      // For now, show a placeholder QR code and guide users
      // Full WalletConnect implementation would require more setup
      const placeholderQR = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(window.location.href)}`;
      setQrCodeUri(placeholderQR);
      
      toast({
        title: "Scan with your wallet",
        description: "Open your mobile wallet and scan this QR code",
      });
    } catch (error) {
      console.error('WalletConnect init error:', error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Failed to initialize WalletConnect",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black bg-opacity-50">
      <div className="bg-gray-300 win98-border w-full max-w-md shadow-2xl">
        {/* Title Bar */}
        <div className="h-8 bg-gray-300 win98-border-inset flex items-center justify-between px-2">
          <span className="text-black font-bold text-sm font-military">WalletConnect</span>
          <button
            onClick={onClose}
            className="h-6 w-6 win98-border flex items-center justify-center hover:bg-gray-400"
          >
            <span className="text-xs font-bold font-pixel">×</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold font-pixel text-gradient-blue">
              Scan QR Code
            </h3>
            <p className="text-sm font-retro text-gray-700">
              Scan with WalletConnect-compatible wallet
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="win98-border-inset p-4 bg-white">
              {isConnecting ? (
                <div className="w-64 h-64 flex items-center justify-center">
                  <p className="text-sm font-pixel animate-pulse">Loading...</p>
                </div>
              ) : qrCodeUri ? (
                <img 
                  src={qrCodeUri} 
                  alt="WalletConnect QR Code" 
                  className="w-64 h-64"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-gray-100">
                  <p className="text-sm text-gray-500 font-retro">No QR code available</p>
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-2 text-sm font-retro text-gray-700">
            <p>1. Open your mobile wallet</p>
            <p>2. Tap the scan button (usually 📷)</p>
            <p>3. Point your camera at this QR code</p>
            <p>4. Approve the connection request</p>
          </div>

          {/* Mobile Alternative */}
          <div className="win98-border bg-blue-50 p-3">
            <p className="text-xs font-retro text-blue-800">
              <strong>On mobile?</strong> For the best experience, open this page directly in your wallet's browser instead.
            </p>
          </div>

          {/* Supported Wallets */}
          <div className="text-center">
            <p className="text-xs text-gray-600 font-retro">
              Works with: MetaMask, Rainbow, Trust Wallet, Argent, and 100+ more wallets
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
