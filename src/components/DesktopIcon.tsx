interface DesktopIconProps {
  icon: string;
  label: string;
  onClick: () => void;
}

export const DesktopIcon = ({ icon, label, onClick }: DesktopIconProps) => {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-1.5 sm:p-2 hover:bg-primary/20 rounded transition-colors group 
                 w-16 sm:w-24 md:w-28 touch-target flex-shrink-0 min-h-[70px] sm:min-h-[80px] justify-center"
    >
      <img
        src={icon}
        alt={label}
        className="w-12 h-12 sm:w-12 sm:h-12 md:w-14 md:h-14 pixelated group-hover:scale-110 transition-transform"
      />
      <span className="text-[9px] sm:text-xs md:text-sm text-white font-bold text-center 
                       drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] leading-tight px-0.5 break-words max-w-full">
        {label}
      </span>
    </button>
  );
};
