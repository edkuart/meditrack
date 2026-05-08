type AvatarState = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

const CONFIG: Record<AvatarState, { color: string; label: string; ring: string }> = {
  EXCELLENT: { color: '#22c55e', label: 'Muy bien', ring: '#bbf7d0' },
  GOOD:      { color: '#3b82f6', label: 'Bien',     ring: '#bfdbfe' },
  FAIR:      { color: '#f59e0b', label: 'Regular',  ring: '#fde68a' },
  POOR:      { color: '#94a3b8', label: 'Descansando', ring: '#e2e8f0' },
}

export function PatientAvatar({ state, score }: { state: AvatarState; score: number }) {
  const { color, label, ring } = CONFIG[state]

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Figure */}
      <div
        className="relative flex items-center justify-center rounded-full transition-all duration-700"
        style={{ width: 120, height: 120, background: ring }}
      >
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transition-all duration-700"
        >
          {/* Head */}
          <circle cx="36" cy="20" r="12" fill={color} opacity="0.9" />
          {/* Body */}
          <rect x="22" y="35" width="28" height="22" rx="8" fill={color} opacity="0.8" />
          {/* Arms */}
          <rect x="8" y="37" width="14" height="8" rx="4" fill={color} opacity="0.7"
            style={{ transform: state === 'EXCELLENT' ? 'rotate(-20deg)' : 'none', transformOrigin: '22px 41px' }}
          />
          <rect x="50" y="37" width="14" height="8" rx="4" fill={color} opacity="0.7" />
          {/* Legs */}
          <rect x="24" y="56" width="10" height="14" rx="5" fill={color} opacity="0.8" />
          <rect x="38" y="56" width="10" height="14" rx="5" fill={color} opacity="0.8" />
          {/* Face — smile on GOOD/EXCELLENT, neutral otherwise */}
          {(state === 'EXCELLENT' || state === 'GOOD') && (
            <path
              d="M30 22 Q36 27 42 22"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          )}
          {(state === 'FAIR' || state === 'POOR') && (
            <line x1="30" y1="24" x2="42" y2="24" stroke="white" strokeWidth="2" strokeLinecap="round" />
          )}
          {/* Eyes */}
          <circle cx="32" cy="18" r="2" fill="white" />
          <circle cx="40" cy="18" r="2" fill="white" />
        </svg>
      </div>

      {/* Score + label */}
      <div className="text-center">
        <p className="text-3xl font-bold" style={{ color }}>{score}%</p>
        <p className="text-sm text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  )
}
