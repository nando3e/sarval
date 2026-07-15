import { useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { api } from '../api';
import styles from './SimulationBanner.module.css';

function fmt(n, dec = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

/**
 * Señalización global del modo simulación (vive en Layout, visible en todas
 * las vistas): aura roja + cartel con "Aplicar cambios" / "Cancelar", el aviso
 * para retomar una simulación abierta y el modal de diff previo al aplicar.
 */
export default function SimulationBanner() {
  const {
    weeks,
    simulation,
    isSimulating,
    pendingResume,
    resumeSimulation,
    discardPendingSimulation,
    applySimulation,
    cancelSimulation,
  } = usePlan();

  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState('');

  const parentLabel =
    simulation?.parentId === weeks.proxima?.id
      ? weeks.proxima?.week_label
      : weeks.vigente?.week_label || 'Semana vigente';

  const handleCancel = async () => {
    if (!window.confirm('¿Cancelar la simulación? Se descartarán TODOS los cambios simulados.')) return;
    setBusy(true);
    setError('');
    try {
      await cancelSimulation();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openDiff = async () => {
    setDiffOpen(true);
    setDiffLoading(true);
    setError('');
    try {
      setDiff(await api(`/api/planning/simulation/${simulation.id}/diff`));
    } catch (err) {
      setError(err.message);
      setDiffOpen(false);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    setError('');
    try {
      await applySimulation();
      setDiffOpen(false);
      setDiff(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardPending = async () => {
    if (!window.confirm('¿Descartar la simulación abierta? Se perderán sus cambios.')) return;
    setBusy(true);
    try {
      await discardPendingSimulation();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Aviso de simulación pendiente de retomar (tras un refresh / otra sesión)
  if (!isSimulating) {
    if (!pendingResume) return null;
    return (
      <div className={styles.resumeBar}>
        <span>
          ⚠️ Tienes una <strong>simulación abierta</strong> de una sesión anterior.
        </span>
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={resumeSimulation} disabled={busy}>
            Retomar
          </button>
          <button type="button" className={styles.btnGhost} onClick={handleDiscardPending} disabled={busy}>
            Descartar
          </button>
        </div>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    );
  }

  const changedTables = diff?.tables?.filter((t) => t.altas || t.bajas || t.modificados) ?? [];
  const kpiRows = diff
    ? [
        { label: 'Viajes con retraso', real: fmt(diff.kpis.real.viajes_con_retraso), sim: fmt(diff.kpis.simulacion.viajes_con_retraso) },
        { label: 'Horas paradas', real: fmt(diff.kpis.real.horas_paradas, 2), sim: fmt(diff.kpis.simulacion.horas_paradas, 2) },
        { label: 'Stock mínimo (t)', real: fmt(diff.kpis.real.stock_minimo, 1), sim: fmt(diff.kpis.simulacion.stock_minimo, 1) },
      ]
    : [];

  return (
    <>
      <div className={styles.aura} aria-hidden="true" />
      <div className={styles.banner} role="alert">
        <span className={styles.title}>🔴 MODO SIMULACIÓN — los cambios NO son reales</span>
        <span className={styles.subtitle}>Simulando sobre: {parentLabel}</span>
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={openDiff} disabled={busy}>
            Aplicar cambios
          </button>
          <button type="button" className={styles.btnGhost} onClick={handleCancel} disabled={busy}>
            Cancelar simulación
          </button>
        </div>
        {error && !diffOpen && <span className={styles.error}>{error}</span>}
      </div>

      {diffOpen && (
        <div className={styles.modalBackdrop} onClick={() => !busy && setDiffOpen(false)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Aplicar cambios al plan real</span>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setDiffOpen(false)}
                disabled={busy}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {diffLoading ? (
              <p className={styles.muted}>Calculando diferencias…</p>
            ) : diff ? (
              <>
                {diff.base_changed && (
                  <div className={styles.warnBox}>
                    ⚠️ El plan real ha cambiado desde que empezaste a simular (otro usuario o el bot).
                    Al aplicar, esos cambios se sobrescribirán con lo que ves en la simulación.
                  </div>
                )}

                {changedTables.length === 0 ? (
                  <p className={styles.muted}>No hay cambios respecto al plan real.</p>
                ) : (
                  <ul className={styles.diffList}>
                    {changedTables.map((t) => (
                      <li key={t.tabla}>
                        <strong>{t.etiqueta}:</strong>{' '}
                        {[
                          t.altas ? `${t.altas} nuevo(s)` : null,
                          t.bajas ? `${t.bajas} eliminado(s)` : null,
                          t.modificados ? `${t.modificados} modificado(s)` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </li>
                    ))}
                  </ul>
                )}

                <table className={styles.kpiTable}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Plan real</th>
                      <th>Simulación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiRows.map((row) => (
                      <tr key={row.label} className={row.real !== row.sim ? styles.kpiChanged : undefined}>
                        <td>{row.label}</td>
                        <td>{row.real}</td>
                        <td>{row.sim}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.modalFooter}>
                  <button type="button" className={styles.btnGhost} onClick={() => setDiffOpen(false)} disabled={busy}>
                    Volver
                  </button>
                  <button type="button" className={styles.btnDanger} onClick={handleApply} disabled={busy}>
                    {busy ? 'Aplicando…' : 'Confirmar y aplicar al plan real'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
