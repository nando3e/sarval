import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import { shortDate, getWeekStart } from '../utils/dates';
import styles from './Tables.module.css';

const toHHmm = (v) => String(v ?? '').slice(0, 5);

export default function Secuenciacion() {
  const { planId, weeks } = usePlan();
  const { tolvas } = useTolvas();
  const weekStart = getWeekStart(planId, weeks);
  const [sequence, setSequence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recalculating, setRecalculating] = useState(false);
  const [filterTolva, setFilterTolva] = useState('');
  const [divertingId, setDivertingId] = useState(null);
  const [divertTarget, setDivertTarget] = useState('');
  const [divertBusy, setDivertBusy] = useState(false);

  const load = () => {
    const q = filterTolva ? `?tolva_id=${filterTolva}` : '';
    return api(`/api/planning/sequence${q}`)
      .then(setSequence)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [planId, filterTolva]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setError('');
    try {
      await api('/api/planning/recalculate', { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRecalculating(false);
    }
  };

  const startDivert = (row) => {
    setDivertingId(row.id);
    setDivertTarget('');
  };

  const cancelDivert = () => {
    setDivertingId(null);
    setDivertTarget('');
  };

  const confirmDivert = async (tripId) => {
    if (!divertTarget) return;
    setDivertBusy(true);
    setError('');
    try {
      await api(`/api/trips/${tripId}/divert`, {
        method: 'POST',
        body: JSON.stringify({ tolva_id: Number(divertTarget) }),
      });
      setDivertingId(null);
      setDivertTarget('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDivertBusy(false);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  const dayChanged = (row) => row.day && row.dia_final && row.day !== row.dia_final;
  const showTolvaCol = tolvas.length > 1;

  const retainedCount = sequence.filter((r) => !!r.retenido_por_critico).length;
  const delayedCount = sequence.filter((r) => Number(r.retraso_capacidad_h) > 0).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Secuenciación</h1>
        {showTolvaCol && (
          <select value={filterTolva} onChange={(e) => setFilterTolva(e.target.value)} className={styles.input} style={{ minWidth: 140 }}>
            <option value="">Todas las tolvas</option>
            {tolvas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={handleRecalculate} disabled={recalculating} className={styles.button}>
          {recalculating ? 'Recalculando…' : 'Actualizar'}
        </button>
      </div>

      {(retainedCount > 0 || delayedCount > 0) && (
        <p className={styles.muted} style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          {delayedCount > 0 && <span style={{ color: 'var(--danger)', marginRight: '1rem' }}>{delayedCount} viaje(s) con retraso por capacidad</span>}
          {retainedCount > 0 && <span style={{ color: '#a855f7' }}>{retainedCount} viaje(s) retenido(s) para dejar espacio a un crítico</span>}
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {sequence.length === 0 ? (
        <p className={styles.muted}>No hay secuenciación. Sube una planificación, añade viajes y pulsa Actualizar.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nº viaje</th>
                {showTolvaCol && <th>Tolva</th>}
                <th>Día</th>
                <th>Hora prev.</th>
                <th>Proveedor</th>
                <th>Producto</th>
                <th>Ton</th>
                <th title="Si el viaje es crítico (prioridad alta). Toda la fila se muestra en negrita.">Crítico</th>
                <th title="Retraso (en horas) que el chófer o el bot ha reportado para la llegada de este viaje. Se rellena manualmente o desde Telegram. NOTA: hoy no recalcula automáticamente la secuenciación.">Retraso llegada (h)</th>
                <th title="Nueva hora prevista de llegada cuando el chófer comunica un cambio respecto a la planificada. NOTA: hoy no recalcula la secuenciación.">Nueva hora</th>
                <th title="Estado operativo del viaje: pendiente, confirmado por el chófer, en ruta, llegado, etc. Se actualizará automáticamente cuando el bot esté conectado.">Estado</th>
                <th title="Indica si el viaje no estaba en la planificación base y se ha añadido durante la semana.">Extra</th>
                <th title="Día en que el motor de simulación calcula que el camión descargará realmente.">Día final</th>
                <th title="Hora en que el motor de simulación calcula que el camión descargará realmente.">Hora final</th>
                <th title="Horas que el camión espera entre su hora prevista de llegada y su descarga real, por falta de espacio en el silo.">Retraso cap. (h)</th>
                <th title="El viaje fue retenido por el motor para dejar espacio a un viaje crítico próximo.">Retenido</th>
                {showTolvaCol && <th title="Mover este viaje a otra tolva y recalcular ambas tolvas.">Desviar</th>}
              </tr>
            </thead>
            <tbody>
              {sequence.map((row) => {
                const retCap = Number(row.retraso_capacidad_h) || 0;
                const retained = !!row.retenido_por_critico;
                const isDiverting = divertingId === row.id;
                const otherTolvas = tolvas.filter((t) => t.id !== row.tolva_id);
                const rowClasses = [];
                if (row.critico) rowClasses.push(styles.rowCritical);
                if (retained) rowClasses.push(styles.rowRetained);
                else if (retCap > 0) rowClasses.push(styles.rowDelay);
                else if (dayChanged(row)) rowClasses.push(styles.rowDayChange);
                return (
                  <tr key={row.id} className={rowClasses.join(' ')}>
                    <td>{row.trip_number}</td>
                    {showTolvaCol && <td>{row.tolva_nombre || `Tolva ${row.tolva_numero || '?'}`}</td>}
                    <td>{row.day}{weekStart ? ` ${shortDate(weekStart, row.day)}` : ''}</td>
                    <td>{toHHmm(row.hora_prevista)}</td>
                    <td>{row.supplier}</td>
                    <td>{row.producto || '—'}</td>
                    <td>{row.tons}</td>
                    <td>{row.critico ? 'Sí' : 'No'}</td>
                    <td>{row.retraso_h != null && Number(row.retraso_h) > 0 ? Number(row.retraso_h).toFixed(1) : ''}</td>
                    <td>{toHHmm(row.nueva_hora)}</td>
                    <td>{row.estado !== 'pending' ? row.estado : ''}</td>
                    <td>{row.viaje_extra ? 'Sí' : ''}</td>
                    <td>{row.dia_final}{weekStart && row.dia_final ? ` ${shortDate(weekStart, row.dia_final)}` : ''}</td>
                    <td>{toHHmm(row.hora_final)}</td>
                    <td>{retCap > 0 ? retCap.toFixed(1) : ''}</td>
                    <td>{retained ? 'Sí' : ''}</td>
                    {showTolvaCol && (
                      <td>
                        {isDiverting ? (
                          <span className={styles.actions}>
                            <select value={divertTarget} onChange={(e) => setDivertTarget(e.target.value)} className={styles.selectInline} style={{ minWidth: 90 }}>
                              <option value="">Tolva…</option>
                              {otherTolvas.map((t) => (
                                <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
                              ))}
                            </select>
                            <button type="button" className={styles.btnSmall} disabled={!divertTarget || divertBusy} onClick={() => confirmDivert(row.trip_id)}>
                              {divertBusy ? '…' : 'OK'}
                            </button>
                            <button type="button" className={styles.btnSmall} onClick={cancelDivert}>✕</button>
                          </span>
                        ) : (
                          otherTolvas.length > 0 && (
                            <button type="button" className={styles.btnSmall} onClick={() => startDivert(row)} title="Desviar a otra tolva">
                              Desviar
                            </button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
