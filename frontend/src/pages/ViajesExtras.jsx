import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import styles from './Tables.module.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function ViajesExtras() {
  const { planId } = usePlan();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ day: 'Lunes', scheduled_time: '08:00', supplier: '', tons: '', is_critical: false });
  const [saving, setSaving] = useState(false);

  const load = () => api('/api/trips').then(setTrips).catch((e) => setError(e.message));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [planId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/api/trips/extra', {
        method: 'POST',
        body: JSON.stringify({
          day: form.day,
          scheduled_time: form.scheduled_time,
          supplier: form.supplier.trim(),
          tons: Number(form.tons),
          is_critical: form.is_critical,
        }),
      });
      setForm({ day: 'Lunes', scheduled_time: '08:00', supplier: '', tons: '', is_critical: false });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const extras = trips.filter((t) => t.is_extra);

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Viajes extras</h1>
      {error && <p className={styles.error}>{error}</p>}
      <form onSubmit={handleSubmit} className={styles.form}>
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
                <th>#</th>
                <th>Día</th>
                <th>Hora</th>
                <th>Proveedor</th>
                <th>Ton</th>
                <th>Crítico</th>
              </tr>
            </thead>
            <tbody>
              {extras.map((t) => (
                <tr key={t.id}>
                  <td>{t.trip_number}</td>
                  <td>{t.day}</td>
                  <td>{String(t.scheduled_time ?? '').slice(0, 5)}</td>
                  <td>{t.supplier}</td>
                  <td>{t.tons}</td>
                  <td>{t.is_critical ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
