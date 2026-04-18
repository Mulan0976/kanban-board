interface BetterBoardIconProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function BetterBoardIcon({
  size = 32,
  className = '',
  animate = false,
}: BetterBoardIconProps) {
  const gradId = `bb-grad-${Math.random().toString(36).slice(2, 8)}`;
  const glowId = `bb-glow-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        x="3"
        y="3"
        width="7"
        height="18"
        rx="2"
        fill={`url(#${gradId})`}
        filter={`url(#${glowId})`}
      >
        {animate && (
          <animate
            attributeName="height"
            values="18;14;18"
            dur="3s"
            repeatCount="indefinite"
          />
        )}
      </rect>
      <rect
        x="12.5"
        y="3"
        width="7"
        height="13"
        rx="2"
        fill={`url(#${gradId})`}
        opacity="0.75"
        filter={`url(#${glowId})`}
      >
        {animate && (
          <animate
            attributeName="height"
            values="13;20;13"
            dur="3s"
            repeatCount="indefinite"
            begin="0.4s"
          />
        )}
      </rect>
      <rect
        x="22"
        y="3"
        width="7"
        height="9"
        rx="2"
        fill={`url(#${gradId})`}
        opacity="0.5"
        filter={`url(#${glowId})`}
      >
        {animate && (
          <animate
            attributeName="height"
            values="9;16;9"
            dur="3s"
            repeatCount="indefinite"
            begin="0.8s"
          />
        )}
      </rect>

      <circle cx="6.5" cy="26" r="1.2" fill="#34d399" opacity="0.9" />
      <circle cx="16" cy="26" r="1.2" fill="#34d399" opacity="0.65" />
      <circle cx="25.5" cy="26" r="1.2" fill="#34d399" opacity="0.4" />
    </svg>
  );
}
