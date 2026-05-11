import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import styles from './Tables.module.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const toHHmm = (v) => String(v ?? '').slice(0, 5);

export default function Boxes() {
  const { planId } = usePlan();
  const { tolvas } = useTolvas();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    tolva_id: '',
    num_boxes: 1,
    total_tons: '',
    periodo_horas: 24,
    dia: 'Lunes',
    hora_inicio: '06:00',
    descripcion: '',
  });

  const load = () =>
    api('/api/box-entries')
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
      await api('/api/box-entries', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      setForm((f) => ({ ...f, num_boxes: 1, total_tons: '', descripcion: '' }));
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
      const res = await fetch(`/api/box-entries/${id}`, {
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
        <h1 className={styles.h1}>Entradas de boxes</h1>
        <button type="button" className={styles.button} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Nueva entrada'}
        </button>
      </div>
      <p className={styles.muted}>
        Registra entradas graduales de contenedores pequeños (boxes). Las toneladas se reparten linealmente durante
        el periodo indicado (ej. 1 tn repartida en 24h = ~0.04 tn/paso de 30 min). Se aplican al recalcular.
      </p>
      {error && <p className={styles.error}>{error}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className={styles.form} style={{ marginBottom: '1.5rem' }}>
          {showTolvaCol && (
            <select value={form.tolva_id} onChange={(e) => setForm((f) => ({ ...f, tolva_id: e.target.value }))} className={styles.input} style={{ minWidth: 130 }}>
              {tolvas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
              ))}
            </select>
          )}
          <select value={form.dia} onChange={(e) => setForm((f) => ({ ...f, dia: e.target.value }))} className={styles.input}>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="time" value={form.hora_inicio} onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))} className={styles.input} title="Hora de inicio" />
          <input type="number" min="1" step="1" placeholder="Nº boxes" value={form.num_boxes} onChange={(e) => setForm((f) => ({ ...f, num_boxes: e.target.value }))} className={styles.input} style={{ width: 90 }} />
          <input type="number" min="0" step="0.1" placeholder="Toneladas totales" value={form.total_tons} onChange={(e) => setForm((f) => ({ ...f, total_tons: e.target.value }))} className={styles.input} style={{ width: 140 }} required />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className={styles.muted} style={{ fontSize: '0.85rem' }}>en</span>
            <input type="number" min="1" max="168" step="1" value={form.periodo_horas} onChange={(e) => setForm((f) => ({ ...f, periodo_horas: e.target.value }))} className={styles.input} style={{ width: 60 }} title="Periodo de reparto (horas)" />
            <span className={styles.muted} style={{ fontSize: '0.85rem' }}>h</span>
          </div>
          <input placeholder="Descripción (opcional)" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} className={styles.input} style={{ minWidth: 160 }} />
          <button type="submit" disabled={saving} className={styles.button}>{saving ? 'Guardando…' : 'Crear'}</button>
        </form>
      )}

      {list.length === 0 ? (
        <p className={styles.muted}>No hay entradas de boxes registradas para este plan.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {showTolvaCol && <th>Tolva</th>}
                <th>Día</th>
                <th>Desde</th>
                <th>Boxes</th>
                <th>Toneladas</th>
                <th>Periodo (h)</th>
                <th>Descripción</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  {showTolvaCol && <td>{b.tolva_nombre || `Tolva ${b.tolva_numero}`}</td>}
                  <td>{b.dia}</td>
                  <td>{toHHmm(b.hora_inicio)}</td>
                  <td>{b.num_boxes}</td>
                  <td>{Number(b.total_tons)}</td>
                  <td>{Number(b.periodo_horas)}</td>
                  <td>{b.descripcion || '—'}</td>
                  <td className={styles.actions}>
                    <button type="button" className={styles.btnDanger} onClick={() => handleDelete(b.id)}>Eliminar</button>
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
