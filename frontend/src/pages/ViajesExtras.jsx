import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import { shortDate, getWeekStart } from '../utils/dates';
import styles from './Tables.module.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function ViajesExtras() {
  const { planId, weeks } = usePlan();
  const { tolvas } = useTolvas();
  const weekStart = getWeekStart(planId, weeks);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ trip_number: '', day: 'Lunes', scheduled_time: '08:00', supplier: '', producto: '', tons: '', is_critical: false, tolva_id: '' });
  const [saving, setSaving] = useState(false);

  const load = () => api('/api/trips').then(setTrips).catch((e) => setError(e.message));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => {
    if (tolvas.length > 0 && !form.tolva_id) {
      setForm((f) => ({ ...f, tolva_id: String(tolvas[0].id) }));
    }
  }, [tolvas]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/api/trips/extra', {
        method: 'POST',
        body: JSON.stringify({
          trip_number: form.trip_number.trim(),
          day: form.day,
          scheduled_time: form.scheduled_time,
          supplier: form.supplier.trim(),
          producto: form.producto.trim(),
          tons: Number(form.tons),
          is_critical: form.is_critical,
          tolva_id: form.tolva_id ? Number(form.tolva_id) : undefined,
        }),
      });
      setForm((f) => ({ ...f, trip_number: '', supplier: '', producto: '', tons: '', is_critical: false }));
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const extras = trips.filter((t) => t.is_extra);
  const showTolvaCol = tolvas.length > 1;

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Viajes extras</h1>
      {error && <p className={styles.error}>{error}</p>}
      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          placeholder="Nº viaje"
          value={form.trip_number}
          onChange={(e) => setForm((f) => ({ ...f, trip_number: e.target.value }))}
          className={styles.input}
          style={{ minWidth: 110 }}
          required
        />
        {showTolvaCol && (
          <select
            value={form.tolva_id}
            onChange={(e) => setForm((f) => ({ ...f, tolva_id: e.target.value }))}
            className={styles.input}
            style={{ minWidth: 130 }}
          >
            {tolvas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
            ))}
          </select>
        )}
        <select
          value={form.day}
          onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
          className={styles.input}
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <input
          type="time"
          value={form.scheduled_time}
          onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))}
          className={styles.input}
        />
        <input
          placeholder="Proveedor"
          value={form.supplier}
          onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
          className={styles.input}
          required
        />
        <input
          placeholder="Producto"
          value={form.producto}
          onChange={(e) => setForm((f) => ({ ...f, producto: e.target.value }))}
          className={styles.input}
          required
        />
        <input
          type="number"
          placeholder="Toneladas"
          min="0"
          step="0.1"
          value={form.tons}
          onChange={(e) => setForm((f) => ({ ...f, tons: e.target.value }))}
          className={styles.input}
          required
        />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.is_critical}
            onChange={(e) => setForm((f) => ({ ...f, is_critical: e.target.checked }))}
          />
          Crítico
        </label>
        <button type="submit" disabled={saving} className={styles.button}>Añadir viaje extra</button>
      </form>
      <h2 className={styles.h2}>Listado de viajes extras</h2>
      {extras.length === 0 ? (
        <p className={styles.muted}>No hay viajes extras.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nº viaje</th>
                {showTolvaCol && <th>Tolva</th>}
                <th>Día</th>
                <th>Hora</th>
                <th>Proveedor</th>
                <th>Producto</th>
                <th>Ton</th>
                <th>Crítico</th>
              </tr>
            </thead>
            <tbody>
              {extras.map((t) => (
                <tr key={t.id}>
                  <td>{t.trip_number}</td>
                  {showTolvaCol && <td>{t.tolva_nombre || (t.tolva_numero ? `Tolva ${t.tolva_numero}` : '—')}</td>}
                  <td>{t.day}{weekStart ? ` ${shortDate(weekStart, t.day)}` : ''}</td>
                  <td>{String(t.scheduled_time ?? '').slice(0, 5)}</td>
                  <td>{t.supplier}</td>
                  <td>{t.producto || '—'}</td>
                  <td>{t.tons}</td>
                  <td>{t.is_critical ? <span className={styles.chipCritical}>Sí</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
