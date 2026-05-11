import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import styles from './Tables.module.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const toHHmm = (v) => String(v ?? '').slice(0, 5);

export default function Paradas() {
  const { planId } = usePlan();
  const { tolvas } = useTolvas();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    tolva_id: '',
    tipo: 'mantenimiento',
    descripcion: '',
    dia: 'Lunes',
    hora_inicio: '08:00',
    hora_fin: '10:00',
  });

  const load = () =>
    api('/api/stoppages')
      .then(setList)
      .catch((e) => setError(e.message));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => {
    if (tolvas.length > 0 && !form.tolva_id) {
      setForm((f) => ({ ...f, tolva_id: String(tolvas[0].id) }));
    }
  }, [tolvas]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/stoppages', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      setForm((f) => ({ ...f, descripcion: '', hora_inicio: '08:00', hora_fin: '10:00' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setError('');
    try {
      const token = localStorage.getItem('sarval_token');
      const res = await fetch(`/api/stoppages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Error al eliminar');
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const showTolvaCol = tolvas.length > 1;

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Paradas</h1>
        <button type="button" className={styles.button} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Nueva parada'}
        </button>
      </div>
      <p className={styles.muted}>Registra paradas por mantenimiento, avería u otros motivos. Durante la parada la productividad de la tolva es 0 tn/h. Se aplican al recalcular la secuenciación.</p>
      {error && <p className={styles.error}>{error}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className={styles.form} style={{ marginBottom: '1.5rem' }}>
          {showTolvaCol && (
            <label className={styles.labelBlock}>
              <span className={styles.labelText}>Tolva</span>
              <select value={form.tolva_id} onChange={(e) => setForm((f) => ({ ...f, tolva_id: e.target.value }))} className={styles.input} style={{ minWidth: 130 }}>
                {tolvas.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.labelBlock}>
            <span className={styles.labelText}>Día</span>
            <select value={form.dia} onChange={(e) => setForm((f) => ({ ...f, dia: e.target.value }))} className={styles.input}>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className={styles.labelBlock}>
            <span className={styles.labelText}>Desde</span>
            <input type="time" value={form.hora_inicio} onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))} className={styles.input} required />
          </label>
          <label className={styles.labelBlock}>
            <span className={styles.labelText}>Hasta</span>
            <input type="time" value={form.hora_fin} onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))} className={styles.input} required />
          </label>
          <label className={styles.labelBlock}>
            <span className={styles.labelText}>Tipo</span>
            <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} className={styles.input}>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="averia">Avería</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label className={styles.labelBlock}>
            <span className={styles.labelText}>Descripción</span>
            <input placeholder="Opcional" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} className={styles.input} style={{ minWidth: 160 }} />
          </label>
          <button type="submit" disabled={saving} className={styles.button} style={{ alignSelf: 'flex-end' }}>{saving ? 'Guardando…' : 'Crear'}</button>
        </form>
      )}

      {list.length === 0 ? (
        <p className={styles.muted}>No hay paradas registradas para este plan.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {showTolvaCol && <th>Tolva</th>}
                <th>Día</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  {showTolvaCol && <td>{s.tolva_nombre || `Tolva ${s.tolva_numero}`}</td>}
                  <td>{s.dia}</td>
                  <td>{toHHmm(s.hora_inicio)}</td>
                  <td>{toHHmm(s.hora_fin)}</td>
                  <td>{s.tipo}</td>
                  <td>{s.descripcion || '—'}</td>
                  <td className={styles.actions}>
                    <button type="button" className={styles.btnDanger} onClick={() => handleDelete(s.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
