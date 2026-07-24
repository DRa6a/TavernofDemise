interface GameOverOverlayProps {
  winnerName?: string;
}

export function GameOverOverlay({ winnerName }: GameOverOverlayProps) {
  if (!winnerName) return null;

  return (
    <div className="overlay game-over-overlay">
      <div className="overlay-backdrop" />
      <div className="overlay-content">
        <div className="overlay-icon">🏆</div>
        <div className="overlay-title">{winnerName}</div>
        <div className="overlay-subtitle">获得胜利</div>
      </div>
    </div>
  );
}
