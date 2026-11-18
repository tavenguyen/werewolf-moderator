export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const safeSeconds = Math.floor(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}
