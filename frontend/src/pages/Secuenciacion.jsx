import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import styles from './Tables.module.css';

const toHHmm = (v) => String(v ?? '').slice(0, 5);

export default function Secuenciacion() {
  const { planId } = usePlan();
  const [sequence, setSequence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recalculating, setRecalculating] = useState(false);

  const load = () =>
    api('/api/planning/sequence')
      .then(setSequence)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [planId]);

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

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  const dayChanged = (row) => row.day && row.dia_final && row.day !== row.dia_final;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Secuenciación</h1>
        <button type="button" onClick={handleRecalculate} disabled={recalculating} className={styles.button}>
          {recalculating ? 'Recalculando…' : 'Actualizar'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {sequence.length === 0 ? (
        <p className={styles.muted}>No hay secuenciación. Sube una planificación, añade viajes y pulsa Actualizar.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Día</th>
                <th>Hora prev.</th>
                <th>Proveedor</th>
                <th>Ton</th>
                <th>Crítico</th>
                <th>Retraso llegada (h)</th>
                <th>Nueva hora</th>
                <th>Estado</th>
                <th>Extra</th>
                <th>Hora real</th>
                <th>Clave</th>
                <th>Día final</th>
                <th>Hora final</th>
                <th>Retraso cap. (h)</th>
              </tr>
            </thead>
            <tbody>
              {sequence.map((row) => {
                const retCap = Number(row.retraso_capacidad_h) || 0;
                return (
                  <tr key={row.id} className={retCap > 0 ? styles.rowDelay : dayChanged(row) ? styles.rowDayChange : ''}>
                    <td>{row.trip_number}</td>
                    <td>{row.day}</td>
                    <td>{toHHmm(row.hora_prevista)}</td>
                    <td>{row.supplier}</td>
                    <td>{row.tons}</td>
                    <td>{row.critico ? 'Sí' : 'No'}</td>
                    <td>{row.retraso_h != null && Number(row.retraso_h) > 0 ? Number(row.retraso_h).toFixed(1) : ''}</td>
                    <td>{toHHmm(row.nueva_hora)}</td>
                    <td>{row.estado !== 'pending' ? row.estado : ''}</td>
                    <td>{row.viaje_extra ? 'Sí' : ''}</td>
                    <td>{toHHmm(row.hora_real)}</td>
                    <td>{row.clave_hora_real || ''}</td>
                    <td>{row.dia_final}</td>
                    <td>{toHHmm(row.hora_final)}</td>
                    <td>{retCap > 0 ? retCap.toFixed(1) : ''}</td>
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
