import { X, Minimize, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WindowProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const Window = ({ title, onClose, children }: WindowProps) => {
  return (
    <div className="fixed inset-0 flex items-start sm:items-center justify-center z-40 p-0 sm:p-2 overflow-y-auto">
      <div className="relative bg-secondary win98-border w-full sm:w-[95%] max-w-sm sm:max-w-md md:max-w-2xl h-[95dvh] sm:h-[90vh] max-h-[95dvh] sm:max-h-[90vh] flex flex-col shadow-2xl min-w-[280px] max-w-full overflow-hidden">
        {/* Title Bar */}
        <div className="h-7 sm:h-8 bg-gray-300 win98-border-inset flex items-center px-1 sm:px-2 flex-shrink-0 gap-1 min-w-0 overflow-hidden">
          <span className="text-black font-bold text-[10px] sm:text-sm font-military truncate min-w-0 flex-1 mr-1">{title}</span>
          <Button
            size="icon"
            variant="secondary"
            className="h-5 w-5 sm:h-6 sm:w-6 p-0 win98-border hover:bg-red-500 hover:text-white flex-shrink-0 touch-target"
            onClick={onClose}
          >
            <X className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          </Button>
        </div>

        {/* Window Content - Scrollable */}
        <div
          className="flex-1 bg-gray-300 p-2 sm:p-4 overflow-y-auto overflow-x-hidden min-h-0 touch-pan-y overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
