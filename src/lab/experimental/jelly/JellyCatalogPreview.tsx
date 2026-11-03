/**
 * Live preview of an experimental Jello preset inside the Studio Library. Loaded with a dynamic import
 * only when the user filters the Library by the Jello family, so the Library itself links no Jelly module.
 * It is the real renderer (JellyButton) on the preset's own document: no picture, no stand-in.
 */
import { useEffect, useMemo } from 'react';
import { createJellyCoordinator } from '../../../runtime/experimental/jelly-scheduler';
import { JellyButton } from './JellyButton';
import { DEFAULT_ENV } from './preview-model';
import { presetDoc } from './workbench';
import './jelly-lab.css';

export default function JellyCatalogPreview({ presetId, label }: { presetId: string; label?: string }) {
  const doc = useMemo(() => presetDoc(presetId), [presetId]);
  const coordinator = useMemo(() => createJellyCoordinator(), []);
  useEffect(() => () => coordinator.destroy(), [coordinator]);
  if (!doc) return <p className="hint" role="status">Anteprima non disponibile.</p>;
  return (
    <div className="jl-stage jl-catalog-stage" data-background="light" data-jelly-catalog-preview={presetId}>
      <div className="jl-scale">
        <JellyButton doc={doc} env={DEFAULT_ENV} state="live" size="sm" label={label ?? 'Jello'} coordinator={coordinator} />
      </div>
    </div>
  );
}
