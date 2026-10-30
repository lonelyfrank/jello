import { setStudioPreferences, useStudioPreferences } from '../studio-preferences';

/** A real grid-column resize, with the same bounds for pointer and keyboard. */
export function PanelResize({ side, visible }: { side: 'left' | 'right'; visible: boolean }) {
  const prefs = useStudioPreferences();
  const key = side === 'left' ? 'leftWidth' : 'rightWidth';
  const min = side === 'left' ? 224 : 300;
  const max = side === 'left' ? 360 : 440;
  const commit = (width: number) => setStudioPreferences({ [key]: Math.round(width) });
  return <div className={`panel-resize panel-resize-${side}`} hidden={!visible} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={side === 'left' ? 'Larghezza libreria' : 'Larghezza inspector'} aria-valuemin={min} aria-valuemax={max} aria-valuenow={prefs[key]}
    onKeyDown={(e) => {
      const delta = e.key === 'ArrowRight' ? 8 : e.key === 'ArrowLeft' ? -8 : 0;
      if (delta) { e.preventDefault(); commit(prefs[key] + delta * (side === 'left' ? 1 : -1)); }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); commit(e.key === 'Home' ? min : max); }
    }}
    onPointerDown={(e) => {
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      target.dataset.startX = String(e.clientX);
      target.dataset.startWidth = String(prefs[key]);
    }}
    onPointerMove={(e) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) commit(Number(e.currentTarget.dataset.startWidth) + (e.clientX - Number(e.currentTarget.dataset.startX)) * (side === 'left' ? 1 : -1));
    }}
    onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
  />;
}
