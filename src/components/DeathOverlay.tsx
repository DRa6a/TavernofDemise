interface DeathOverlayProps {
  playerName?: string;
}

export function DeathOverlay({ playerName }: DeathOverlayProps) {
  if (!playerName) return null;

  return (
    <div className="overlay death-overlay">
      <div className="overlay-backdrop" />
      <div className="overlay-content">
        <div className="overlay-icon">☠️</div>
        <div className="overlay-title">{playerName}</div>
        <div className="overlay-subtitle">已出局</div>
      </div>
    </div>
  );
}
