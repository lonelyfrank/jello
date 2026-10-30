/**
 * Impostazioni: the active project's settings, where data lives, and the UI
 * states reference (the same signals every screen of the lab uses).
 */

import { useState } from 'react';
import { PLATFORM_LABEL, type DefaultPath, type Platform, type PreviewTheme } from '../../project/types';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { SideNav } from './Home';
import { Ic, Segmented, StateChip, Switch, type ChipKind } from './ui';

const PATHS: { id: DefaultPath; label: string }[] = [
  { id: 'auto', label: 'Automatico' },
  { id: 'refraction', label: 'Rifrazione (filtro SVG)' },
  { id: 'satin', label: 'Satinato (backdrop-filter)' },
  { id: 'opaque', label: 'Opaco (fallback)' },
];

export function SettingsPage({ session }: { session: LabSession }) {
  const project = useLab((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const persistent = useLab((s) => s.persistent);
  const note = useLab((s) => s.storageNote);
  const options = useLab((s) => s.options);
  const skipped = useLab((s) => s.projectsSkipped);
  const edit = session.projects;

  return (
    <div className="home settings-page" id="settingsPage">
      <SideNav session={session} current="settings" />
      <main className="home-main settings" aria-label="Impostazioni">
        <h1>Impostazioni</h1>
        <section className="card pad-card" aria-labelledby="s-project">
          <h2 id="s-project">Progetto</h2>
          {project ? (
            <div className="stack">
              <label className="field">
                <span>Nome</span>
                <input value={project.name} maxLength={80} onChange={(e) => edit.update((p) => ({ ...p, name: e.target.value.slice(0, 80) || p.name }))} />
              </label>
              <div className="field">
                <span>Destinazione</span>
                <Segmented<Platform> label="Destinazione" value={project.platform} onChange={(platform) => edit.update((p) => ({ ...p, platform }))} options={(Object.keys(PLATFORM_LABEL) as Platform[]).map((id) => ({ id, label: PLATFORM_LABEL[id] }))} />
              </div>
              <label className="field">
                <span>Percorso di rendering predefinito</span>
                <select value={project.defaultPath} onChange={(e) => edit.update((p) => ({ ...p, defaultPath: e.target.value as DefaultPath }))}>
                  {PATHS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>Tema dell’interfaccia di prova</span>
                <Segmented<PreviewTheme> label="Tema" value={options.theme} onChange={(t) => session.setOption('theme', t)} options={[{ id: 'system', label: 'Sistema' }, { id: 'light', label: 'Chiaro' }, { id: 'dark', label: 'Scuro' }]} />
              </div>
              <div className="row-actions">
                <button type="button" className="button danger" onClick={() => session.openConfirm({ kind: 'delete-project', id: project.id })}>
                  <Ic name="trash" size={14} />
                  Elimina il progetto…
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">Nessun progetto attivo.</p>
          )}
        </section>

        <section className="card pad-card" aria-labelledby="s-storage">
          <h2 id="s-storage">Dove sono i tuoi dati</h2>
          <p className="muted">
            {persistent ? 'Progetti, materiali, componenti e asset sono salvati in questo browser (IndexedDB). Esportali per spostarli su un altro dispositivo.' : (note ?? 'Archiviazione non disponibile: le modifiche restano solo in questa scheda.')}
          </p>
          <StateChip kind={persistent ? 'local' : 'warn'}>{persistent ? 'Locale' : 'Non persistente'}</StateChip>
          {skipped.length > 0 && (
            <ul className="messages" data-ok="false">
              {skipped.map((s) => (
                <li key={s}>Progetto non letto: {s}</li>
              ))}
            </ul>
          )}
          <div className="row-actions">
            <button type="button" className="button" onClick={() => session.openFlow('export')} disabled={!project}>
              <Ic name="upload" size={14} />
              Esporta il progetto
            </button>
            <button type="button" className="button" onClick={() => session.openFlow('import')}>
              <Ic name="download" size={14} />
              Importa
            </button>
          </div>
        </section>

        <StatesReference />
      </main>
    </div>
  );
}

const CHIPS: { kind: ChipKind; label: string }[] = [
  { kind: 'ok', label: 'Superata' },
  { kind: 'neutral', label: 'Solo emulato' },
  { kind: 'warn', label: 'Non eseguibile' },
  { kind: 'neutral', label: 'Non verificato' },
  { kind: 'soon', label: 'In arrivo' },
  { kind: 'accent', label: 'Collegato' },
  { kind: 'local', label: 'Locale' },
  { kind: 'warn', label: 'Approssimazione' },
];

/** The reference page of UI states: a living sample using the real classes. */
function StatesReference() {
  const [on, setOn] = useState(false);
  return (
    <section className="card pad-card" aria-labelledby="s-states">
      <h2 id="s-states">Stati dell’interfaccia</h2>
      <p className="muted">Riferimento per costruire ogni schermata con gli stessi segnali.</p>

      <div className="states-grid">
        <div className="state-sample">
          <h3 className="detail-sub">Pulsanti</h3>
          <div className="state-row">
            <button type="button" className="button primary">
              Primario
            </button>
            <button type="button" className="button primary" disabled>
              Disattivato
            </button>
            <button type="button" className="button">
              Secondario
            </button>
            <button type="button" className="button" aria-busy="true" disabled>
              <Ic name="loader" size={14} />
              Esportazione…
            </button>
            <button type="button" className="button danger">
              Elimina
            </button>
          </div>
        </div>
        <div className="state-sample">
          <h3 className="detail-sub">Campi</h3>
          <div className="state-row">
            <label className="field">
              <span>Normale</span>
              <input defaultValue="8" aria-label="Campo normale" />
            </label>
            <label className="field">
              <span>Errore</span>
              <input defaultValue="7C4DZ" aria-invalid="true" aria-describedby="demo-err" />
              <span id="demo-err" className="field-error">
                Atteso un colore #rrggbb
              </span>
            </label>
            <label className="field">
              <span>Fuori intervallo · corretto da solo</span>
              <input defaultValue="40" aria-label="Campo corretto" />
              <span className="muted small">Hai scritto 64: il massimo per Sfocatura è 40.</span>
            </label>
          </div>
        </div>
        <div className="state-sample">
          <h3 className="detail-sub">Salvataggio</h3>
          <div className="state-row">
            <StateChip kind="ok" icon="check">
              Salvato
            </StateChip>
            <StateChip kind="neutral" icon="loader">
              Salvataggio…
            </StateChip>
            <StateChip kind="danger" icon="alert">
              Non salvato
            </StateChip>
            <StateChip kind="warn" icon="alert">
              Spazio del browser esaurito · esporta il progetto
            </StateChip>
          </div>
        </div>
        <div className="state-sample">
          <h3 className="detail-sub">Etichette di stato</h3>
          <div className="state-row">
            {CHIPS.map((c) => (
              <StateChip key={c.label} kind={c.kind}>
                {c.label}
              </StateChip>
            ))}
          </div>
        </div>
        <div className="state-sample">
          <h3 className="detail-sub">Interruttori</h3>
          <div className="state-row">
            <Switch id="demo-sw" checked={on} onChange={setOn} label="Riduci trasparenza" hint="Forza il percorso opaco" />
          </div>
        </div>
        <div className="state-sample">
          <h3 className="detail-sub">Vuoti e conferme</h3>
          <div className="state-row">
            <div className="empty small-empty">
              <Ic name="heart" size={20} />
              <strong>Nessun preferito</strong>
              <span className="muted small">Usa ♡ su un materiale per aggiungerlo qui.</span>
            </div>
            <div className="empty small-empty">
              <Ic name="search" size={20} />
              <strong>Nessun risultato per “metallo”</strong>
              <span className="muted small">Metal è in sviluppo: per ora prova “Vetro fumé”.</span>
            </div>
            <div className="confirm-sample" role="group" aria-label="Esempio di conferma">
              <strong>Eliminare “Satinato chiaro”?</strong>
              <span className="muted small">È usato da 1 componente. La componente passerà a una copia locale con gli stessi valori.</span>
              <span className="row-actions">
                <button type="button" className="button small">
                  Annulla
                </button>
                <button type="button" className="button small danger">
                  Elimina
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
