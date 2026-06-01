import { useState, useEffect } from 'react';
import { api } from '../api';
import { useTolvas } from '../context/TolvaContext';
import styles from './Tables.module.css';

const PARAM_FIELDS = [
  { key: 'capacidad_tn', label: 'Capacidad (tn)', step: '0.1' },
  { key: 'consumo_tn_h', label: 'Consumo (tn/h)', step: '0.1' },
  { key: 'nivel_inicial_tn', label: 'Nivel inicial (tn)', step: '0.1' },
  { key: 'paso_minutos', label: 'Paso (min)', step: '1' },
  { key: 'nivel_minimo_alerta_tn', label: 'Alerta nivel mín. (tn)', step: '0.1' },
  { key: 'max_espera_critico_h', label: 'Espera máx. crítico (h)', step: '0.1' },
];

// El nivel inicial se puede ajustar por semana concreta desde Productividad.
const OVERRIDE_HINT = 'Valor por defecto para todas las semanas. Para cambiarlo solo en una semana concreta, hazlo en Productividad (en la tolva correspondiente); así afectará únicamente a esa semana.';

// La ventana de consumo (inicio Lunes / fin Sábado) es igual para todas las
// semanas. Para consumir fuera de ella (p.ej. el finde) se añade una franja en
// Productividad, que activa el consumo en su tramo.
const CONSUMO_HINT = 'Ventana de consumo base, igual para todas las semanas. Para consumir fuera de ella (p.ej. sábado noche o domingo), añade una franja en Productividad: activa el consumo en su tramo.';

function InfoIcon({ text }) {
  return (
    <span
      title={text}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, marginLeft: 4, borderRadius: '50%',
        border: '1px solid var(--text-muted)', color: 'var(--text-muted)',
        fontSize: 10, fontWeight: 700, cursor: 'help', verticalAlign: 'middle',
      }}
    >i</span>
  );
}

export default function Tolvas() {
  const { loadTolvas } = useTolvas();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [newTolva, setNewTolva] = useState({ numero: '', nombre: '', capacidad_tn: 40, consumo_tn_h: 12, nivel_inicial_tn: 20, paso_minutos: 30, hora_inicio_consumo: '06:00', hora_fin_consumo: '22:00' });

  const load = () =>
    api('/api/tolvas?todas=true').then(setList).catch((e) => setError(e.message));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTolva.numero) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/tolvas', { method: 'POST', body: JSON.stringify(newTolva) });
      setNewTolva({ numero: '', nombre: '', capacidad_tn: 40, consumo_tn_h: 12, nivel_inicial_tn: 20, paso_minutos: 30, hora_inicio_consumo: '06:00', hora_fin_consumo: '22:00' });
      setShowForm(false);
      await Promise.all([load(), loadTolvas()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditData({
      nombre: t.nombre,
      capacidad_tn: Number(t.capacidad_tn),
      consumo_tn_h: Number(t.consumo_tn_h),
      nivel_inicial_tn: Number(t.nivel_inicial_tn),
      paso_minutos: Number(t.paso_minutos),
      nivel_minimo_alerta_tn: t.nivel_minimo_alerta_tn != null ? Number(t.nivel_minimo_alerta_tn) : '',
      max_espera_critico_h: t.max_espera_critico_h != null ? Number(t.max_espera_critico_h) : '',
      hora_inicio_consumo: String(t.hora_inicio_consumo || '06:00').slice(0, 5),
      hora_fin_consumo: String(t.hora_fin_consumo || '22:00').slice(0, 5),
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async (id) => {
    setError('');
    setSaving(true);
    try {
      const body = { ...editData };
      if (body.nivel_minimo_alerta_tn === '' || body.nivel_minimo_alerta_tn === undefined) body.nivel_minimo_alerta_tn = null;
      else body.nivel_minimo_alerta_tn = Number(body.nivel_minimo_alerta_tn);
      if (body.max_espera_critico_h === '' || body.max_espera_critico_h === undefined) body.max_espera_critico_h = null;
      else body.max_espera_critico_h = Number(body.max_espera_critico_h);
      await api(`/api/tolvas/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      setEditingId(null);
      await Promise.all([load(), loadTolvas()]);
      window.dispatchEvent(new Event('sarval:tolva-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActiva = async (t) => {
    setError('');
    try {
      await api(`/api/tolvas/${t.id}`, { method: 'PUT', body: JSON.stringify({ activa: !t.activa }) });
      await Promise.all([load(), loadTolvas()]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Tolvas</h1>
        <button type="button" className={styles.button} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Nueva tolva'}
        </button>
      </div>
      <p className={styles.muted}>Cada tolva tiene sus propios parámetros de simulación. Los viajes se asignan a una tolva concreta.</p>
      {error && <p className={styles.error}>{error}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className={styles.form} style={{ marginBottom: '1.5rem' }}>
          <input type="number" min="1" placeholder="Nº" value={newTolva.numero} onChange={(e) => setNewTolva((f) => ({ ...f, numero: e.target.value }))} className={styles.input} style={{ width: 60 }} required />
          <input placeholder="Nombre (opcional)" value={newTolva.nombre} onChange={(e) => setNewTolva((f) => ({ ...f, nombre: e.target.value }))} className={styles.input} style={{ minWidth: 160 }} />
          <input type="number" min="0" step="0.1" placeholder="Capacidad tn" value={newTolva.capacidad_tn} onChange={(e) => setNewTolva((f) => ({ ...f, capacidad_tn: e.target.value }))} className={styles.input} style={{ width: 110 }} />
          <input type="number" min="0" step="0.1" placeholder="Consumo tn/h" value={newTolva.consumo_tn_h} onChange={(e) => setNewTolva((f) => ({ ...f, consumo_tn_h: e.target.value }))} className={styles.input} style={{ width: 110 }} />
          <input type="number" min="0" step="0.1" placeholder="Nivel ini. tn" value={newTolva.nivel_inicial_tn} onChange={(e) => setNewTolva((f) => ({ ...f, nivel_inicial_tn: e.target.value }))} className={styles.input} style={{ width: 110 }} />
          <input type="number" min="1" step="1" placeholder="Paso min" value={newTolva.paso_minutos} onChange={(e) => setNewTolva((f) => ({ ...f, paso_minutos: e.target.value }))} className={styles.input} style={{ width: 90 }} />
          <label style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Inicio consumo (Lun)
            <input type="time" value={newTolva.hora_inicio_consumo} onChange={(e) => setNewTolva((f) => ({ ...f, hora_inicio_consumo: e.target.value }))} className={styles.input} style={{ width: 110 }} />
          </label>
          <label style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Fin consumo (Sáb)
            <input type="time" value={newTolva.hora_fin_consumo} onChange={(e) => setNewTolva((f) => ({ ...f, hora_fin_consumo: e.target.value }))} className={styles.input} style={{ width: 110 }} />
          </label>
          <button type="submit" disabled={saving} className={styles.button}>{saving ? 'Guardando…' : 'Crear'}</button>
        </form>
      )}

      {list.length === 0 ? (
        <p className={styles.muted}>No hay tolvas configuradas.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nombre</th>
                <th>Capacidad (tn)</th>
                <th>Consumo (tn/h)</th>
                <th>Nivel ini. (tn)<InfoIcon text={OVERRIDE_HINT} /></th>
                <th>Paso (min)</th>
                <th>Alerta mín. (tn)</th>
                <th>Espera máx. crít. (h)</th>
                <th>Inicio consumo (Lun)<InfoIcon text={CONSUMO_HINT} /></th>
                <th>Fin consumo (Sáb)<InfoIcon text={CONSUMO_HINT} /></th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id}>
                    <td>{t.numero}</td>
                    <td><input value={editData.nombre} onChange={(e) => setEditData((d) => ({ ...d, nombre: e.target.value }))} className={styles.inputInline} /></td>
                    {PARAM_FIELDS.map(({ key, step }) => (
                      <td key={key}>
                        <input type="number" min="0" step={step} value={editData[key] ?? ''} onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))} className={styles.inputInline} style={{ width: 80 }} />
                      </td>
                    ))}
                    <td>
                      <input type="time" value={editData.hora_inicio_consumo ?? '06:00'} onChange={(e) => setEditData((d) => ({ ...d, hora_inicio_consumo: e.target.value }))} className={styles.inputInline} style={{ width: 90 }} />
                    </td>
                    <td>
                      <input type="time" value={editData.hora_fin_consumo ?? '22:00'} onChange={(e) => setEditData((d) => ({ ...d, hora_fin_consumo: e.target.value }))} className={styles.inputInline} style={{ width: 90 }} />
                    </td>
                    <td>
                      <label className={styles.toggleWrap}>
                        <input type="checkbox" checked={!!t.activa} onChange={() => toggleActiva(t)} className={styles.toggleInput} />
                        <span className={styles.toggleSlider} />
                      </label>
                    </td>
                    <td className={styles.actions}>
                      <button type="button" className={styles.btnSmall} onClick={() => saveEdit(t.id)} disabled={saving}>Guardar</button>
                      <button type="button" className={styles.btnSmall} onClick={cancelEdit}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} style={{ opacity: t.activa ? 1 : 0.5 }}>
                    <td>{t.numero}</td>
                    <td>{t.nombre || `Tolva ${t.numero}`}</td>
                    <td>{Number(t.capacidad_tn)}</td>
                    <td>{Number(t.consumo_tn_h)}</td>
                    <td>{Number(t.nivel_inicial_tn)}</td>
                    <td>{t.paso_minutos}</td>
                    <td>{t.nivel_minimo_alerta_tn != null ? Number(t.nivel_minimo_alerta_tn) : '—'}</td>
                    <td>{t.max_espera_critico_h != null ? Number(t.max_espera_critico_h) : '—'}</td>
                    <td>{String(t.hora_inicio_consumo || '06:00').slice(0, 5)}</td>
                    <td>{String(t.hora_fin_consumo || '22:00').slice(0, 5)}</td>
                    <td>
                      <label className={styles.toggleWrap}>
                        <input type="checkbox" checked={!!t.activa} onChange={() => toggleActiva(t)} className={styles.toggleInput} />
                        <span className={styles.toggleSlider} />
                        <span className={styles.toggleLabel}>{t.activa ? 'Activa' : 'Inactiva'}</span>
                      </label>
                    </td>
                    <td className={styles.actions}>
                      <button type="button" className={styles.btnSmall} onClick={() => startEdit(t)}>Editar</button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
