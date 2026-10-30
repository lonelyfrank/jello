import { createContext, useContext, useState } from 'react';

const Level = createContext(false);
export const useAdvanced = () => useContext(Level);

/** Presentation only: switching level never changes the canonical definition. */
export function InspectorLevel({ children }: { children: React.ReactNode }) {
  const [advanced, setAdvanced] = useState(false);
  return <Level.Provider value={advanced}>
    <div className="inspector-level" role="group" aria-label="Livello dei controlli">
      <button type="button" className="button small" aria-pressed={!advanced} onClick={() => setAdvanced(false)}>Base</button>
      <button type="button" className="button small" aria-pressed={advanced} onClick={() => setAdvanced(true)}>Avanzato</button>
      <p className="hint">{advanced ? 'Tutte le proprietà supportate, con unità, intervalli e ripristino.' : 'Controlli essenziali. Avanzato mostra stati, eventi e dettagli senza cambiare i dati.'}</p>
    </div>
    {children}
  </Level.Provider>;
}

export const BASIC_FIELDS = new Set([
  'layout.size', 'layout.widthMode', 'layout.width', 'layout.maxWidth', 'layout.radius', 'layout.gap',
  'layout.labels', 'layout.placement', 'layout.iconPosition', 'style.variant',
  'appearance.indicator.style', 'appearance.indicator.color',
  'style.color', 'typography.size', 'typography.weight',
]);

export const BASIC_MATERIAL = new Set(['fill', 'foreground', 'borderColor', 'borderWidth', 'elevation', 'tint', 'tintOpacity', 'blur', 'refraction']);
