import { useEffect, useRef } from 'react';
import type { ComponentDefinition } from '../../components';
import { mountComponent } from '../../runtime/components';

/** Read-only sample using the public component runtime. CSS backend is stated in the UI. */
export function RuntimeThumbnail({ doc }: { doc: ComponentDefinition }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current!;
    let cleanup: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || cleanup) return;
      const source = root.querySelector<HTMLElement>('.runtime-source')!;
      const container = root.querySelector<HTMLElement>('.runtime-container')!;
      const instance = mountComponent({ container, config: doc, source, backend: 'css', anchor: 'container' });
      instance.setInteractive(false);
      cleanup = () => instance.destroy();
    });
    observer.observe(root);
    return () => { observer.disconnect(); cleanup?.(); };
  }, [doc]);
  return <div className="runtime-thumbnail" ref={ref} aria-hidden="true" inert>
    <div className="runtime-source"><span /><span /><span /></div>
    <div className="runtime-container" />
  </div>;
}
