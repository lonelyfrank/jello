import { useEffect, useState } from 'react';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { Ic, Modal } from './ui';

/** Destructive actions ask first, and say what else is affected. */
export function ConfirmHost({ session }: { session: LabSession }) {
  const confirm = useLab((s) => s.confirm);
  const projects = useLab((s) => s.projects);
  const library = useLab((s) => s.library);
  const components = useLab((s) => s.components);
  const close = () => session.openConfirm(null);
  if (!confirm) return null;

  if (confirm.kind === 'delete-project') {
    const p = projects.find((x) => x.id === confirm.id);
    if (!p) return null;
    const n = session.projects.counts(p.id);
    return (
      <Modal title={`Eliminare «${p.name}»?`} onClose={close} role="alertdialog">
        <p className="muted">
          Verranno eliminati anche {n.materials} {n.materials === 1 ? 'materiale' : 'materiali'} e {n.components} {n.components === 1 ? 'componente' : 'componenti'} del progetto, con i suoi asset. L’azione non si può annullare: esporta prima il progetto se ne vuoi una copia.
        </p>
        <div className="row-actions end">
          <button type="button" className="button" onClick={close}>
            Annulla
          </button>
          <button
            type="button"
            className="button danger"
            id="confirmDelete"
            onClick={async () => {
              close();
              const ok = await session.projects.remove(p.id);
              if (ok) session.notify(`Progetto «${p.name}» eliminato.`);
            }}
          >
            Elimina
          </button>
        </div>
      </Modal>
    );
  }

  if (confirm.kind === 'delete-material') {
    const m = library.find((x) => x.id === confirm.id);
    if (!m) return null;
    const using = session.componentsUsing(m.id);
    return (
      <Modal title={`Eliminare «${m.name}»?`} onClose={close} role="alertdialog">
        <p className="muted">
          {using.length
            ? `È usato da ${using.length} ${using.length === 1 ? 'componente' : 'componenti'} (${using.join(', ')}): ${using.length === 1 ? 'passerà' : 'passeranno'} a una copia locale con gli stessi valori.`
            : 'Il materiale personale viene eliminato dalla libreria del progetto.'}
        </p>
        <div className="row-actions end">
          <button type="button" className="button" onClick={close}>
            Annulla
          </button>
          <button type="button" className="button danger" id="confirmDelete" onClick={() => (close(), void session.deleteMaterial(m.id))}>
            Elimina
          </button>
        </div>
      </Modal>
    );
  }

  const c = components.find((x) => x.id === confirm.id);
  if (!c) return null;
  return (
    <Modal title={`Eliminare «${c.name}»?`} onClose={close} role="alertdialog">
      <p className="muted">La componente viene eliminata dalla libreria del progetto.</p>
      <div className="row-actions end">
        <button type="button" className="button" onClick={close}>
          Annulla
        </button>
        <button type="button" className="button danger" id="confirmDelete" onClick={() => (close(), void session.deleteComponent(c.id))}>
          Elimina
        </button>
      </div>
    </Modal>
  );
}

/** Files dragged over the window: the whole page says where they will go. */
export function DropOverlay({ session }: { session: LabSession }) {
  const [files, setFiles] = useState<number | null>(null);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setFiles(e.dataTransfer?.items.length ?? 1);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setFiles(null);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      depth = 0;
      setFiles(null);
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      const list = [...(e.dataTransfer?.files ?? [])];
      if (list.length) session.openFlow('import', list);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [session]);
  if (files === null) return null;
  return (
    <div className="drop-overlay" role="status" aria-live="polite">
      <div className="drop-overlay-card">
        <Ic name="upload" size={28} />
        <strong>Rilascia per importare</strong>
        <span className="muted">
          {files} {files === 1 ? 'file' : 'file'} · i file non supportati verranno elencati e saltati
        </span>
      </div>
    </div>
  );
}
