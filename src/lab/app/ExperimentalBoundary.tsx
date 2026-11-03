/**
 * Isolation of the experimental areas (M6.4.2). The Jello lab, its Library previews and the Builder trial are separate chunks
 * fetched on demand. If one cannot be fetched (offline, a blocked request, a stale deployment) or throws while rendering, the
 * failure stays HERE: the stable Studio, the open project and its autosave are not touched. Without a boundary, React unmounts the
 * whole tree and the person is left with a blank page.
 */
import { Component, lazy, type ComponentType, type ReactNode } from 'react';

/**
 * `React.lazy` that can be tried again. lazy() remembers a rejected import for good, so a retry needs a fresh lazy component; and
 * the element that names it is created by the PARENT, which does not re-render when the boundary resets. `Component` therefore
 * reads the current lazy component when it renders, not when the parent created the element.
 * (Browsers do not cache a failed import() of the same URL — checked in Chromium and Firefox — so a second attempt can succeed.)
 */
export function retryableLazy<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let current = lazy(load);
  const Component = (props: P) => {
    const Current = current as ComponentType<P>;
    return <Current {...props} />;
  };
  return { Component, retry() { current = lazy(load); } };
}

interface Props {
  /** What failed, as the person knows it («Jello Lab», «Anteprima Jello»). */
  what: string;
  /** Called before the subtree is mounted again, to recreate the lazy component. */
  onRetry(): void;
  /** The area is not the one on screen: a failure is kept, but not shown over another page. */
  hidden?: boolean;
  children: ReactNode;
}

export class ExperimentalBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="jl-banner" data-kind="danger" role="alert" data-experimental-failed="true" hidden={this.props.hidden} style={this.props.hidden ? { display: 'none' } : undefined}>
        <p>
          <strong>{this.props.what} non si è caricato.</strong> È una funzione sperimentale caricata a parte: il resto dello Studio e i dati del progetto non sono stati toccati. Controlla la connessione e riprova.
        </p>
        <p className="muted small">Dettaglio tecnico: {error.message}</p>
        <button type="button" className="button small" onClick={() => { this.props.onRetry(); this.setState({ error: null }); }}>Riprova</button>
      </div>
    );
  }
}
