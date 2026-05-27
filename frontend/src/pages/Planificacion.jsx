import { useState, useEffect, useRef } from 'react';
import { api, appendPlanId } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import { shortDate, getWeekStart } from '../utils/dates';
import styles from './Tables.module.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function Planificacion() {
  const { planId, weeks } = usePlan();
  const { tolvas } = useTolvas();
  const weekStart = getWeekStart(planId, weeks);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [filterTolva, setFilterTolva] = useState('');
  const fileRef = useRef(null);

  const load = () => {
    const q = filterTolva ? `?tolva_id=${filterTolva}` : '';
    return api(`/api/trips${q}`)
      .then(setTrips)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [planId, filterTolva]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('sarval_token');
      const res = await fetch(appendPlanId('/api/planning/upload'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al subir');
      setUploadMsg(`${data.imported} viajes importados.${data.parse_errors?.length ? ' Avisos: ' + data.parse_errors.join('; ') : ''}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const startEdit = (trip) => {
    setEditingId(trip.id);
    setEditData({
      day: trip.day,
      scheduled_time: String(trip.scheduled_time ?? '').slice(0, 5),
      supplier: trip.supplier,
      producto: trip.producto || '',
      tons: trip.tons,
      is_critical: trip.is_critical,
      tolva_id: trip.tolva_id || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (id) => {
    try {
      const body = { ...editData };
      if (body.tolva_id) body.tolva_id = Number(body.tolva_id);
      else delete body.tolva_id;
      await api(`/api/trips/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteTrip = async (id) => {
    try {
      const token = localStorage.getItem('sarval_token');
      const res = await fetch(`/api/trips/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al eliminar');
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  const baseTrips = trips.filter((t) => !t.is_extra);
  const showTolvaCol = tolvas.length > 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Planificación</h1>
        {showTolvaCol && (
          <select value={filterTolva} onChange={(e) => setFilterTolva(e.target.value)} className={styles.input} style={{ minWidth: 140 }}>
            <option value="">Todas las tolvas</option>
            {tolvas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
            ))}
          </select>
        )}
      </div>

      <div className={styles.uploadArea}>
        <label className={styles.uploadLabel}>
          {uploading ? 'Subiendo…' : 'Subir CSV / Excel'}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleUpload}
            disabled={uploading}
            className={styles.hiddenInput}
          />
        </label>
        <span className={styles.muted}>Sustituye los viajes base con los del archivo. Los viajes extras se mantienen.</span>
      </div>

      <div className={styles.csvExample}>
        <p className={styles.csvExampleTitle}>Formato del CSV / Excel</p>
        <p className={styles.muted}>Primera fila: cabecera. Filas siguientes: un viaje por línea. Nº viaje: matrícula alfanumérica obligatoria y única dentro de la semana. Días: Lunes…Sábado. Hora: HH:MM. Producto: texto libre obligatorio. Crítico: Sí/Si o vacío. Tolva: nombre exacto de la tolva tal como aparece en la pantalla Tolvas{showTolvaCol ? '' : ' (opcional con una sola tolva; obligatoria cuando hay varias)'}.</p>
        <pre className={styles.csvExampleBlock}>
{`Nº viaje;Día;Hora;Proveedor;Producto;Toneladas;Crítico;Tolva
V-2026-0001;Lunes;07:00;PROVEEDOR A;Maíz;22,5;;${tolvas[0]?.nombre || 'Tolva 1'}
V-2026-0002;Lunes;09:30;PROVEEDOR B;Soja;18;Sí;${tolvas[1]?.nombre || tolvas[0]?.nombre || 'Tolva 1'}
V-2026-0003;Martes;08:00;PROVEEDOR A;Trigo;20;;${tolvas[0]?.nombre || 'Tolva 1'}`}
        </pre>
        <p className={styles.csvExampleNote}>En CSV puedes usar separador <code>;</code> o <code>,</code>. En Excel usa las mismas columnas.</p>
      </div>

      {uploadMsg && <p style={{ color: 'var(--success)', marginBottom: '1rem' }}>{uploadMsg}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {baseTrips.length === 0 ? (
        <p className={styles.muted}>No hay viajes base. Sube un archivo para cargar la planificación semanal.</p>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {baseTrips.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id}>
                    <td>{t.trip_number}</td>
                    {showTolvaCol && (
                      <td>
                        <select value={editData.tolva_id} onChange={(e) => setEditData((d) => ({ ...d, tolva_id: e.target.value }))} className={styles.selectInline}>
                          <option value="">—</option>
                          {tolvas.map((tol) => (
                            <option key={tol.id} value={tol.id}>{tol.nombre || `Tolva ${tol.numero}`}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td>
                      <select value={editData.day} onChange={(e) => setEditData((d) => ({ ...d, day: e.target.value }))} className={styles.selectInline}>
                        {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td><input type="time" value={editData.scheduled_time} onChange={(e) => setEditData((d) => ({ ...d, scheduled_time: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input value={editData.supplier} onChange={(e) => setEditData((d) => ({ ...d, supplier: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input value={editData.producto} onChange={(e) => setEditData((d) => ({ ...d, producto: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input type="number" min="0" step="0.1" value={editData.tons} onChange={(e) => setEditData((d) => ({ ...d, tons: e.target.value }))} className={styles.inputInline} style={{ width: 70 }} /></td>
                    <td><input type="checkbox" checked={editData.is_critical} onChange={(e) => setEditData((d) => ({ ...d, is_critical: e.target.checked }))} /></td>
                    <td className={styles.actions}>
                      <button type="button" className={styles.btnSmall} onClick={() => saveEdit(t.id)}>Guardar</button>
                      <button type="button" className={styles.btnSmall} onClick={cancelEdit}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id}>
                    <td>{t.trip_number}</td>
                    {showTolvaCol && <td>{t.tolva_nombre || (t.tolva_numero ? `Tolva ${t.tolva_numero}` : '—')}</td>}
                    <td>{t.day}{weekStart ? ` ${shortDate(weekStart, t.day)}` : ''}</td>
                    <td>{String(t.scheduled_time ?? '').slice(0, 5)}</td>
                    <td>{t.supplier}</td>
                    <td>{t.producto || '—'}</td>
                    <td>{t.tons}</td>
                    <td>{t.is_critical ? <span className={styles.chipCritical}>Sí</span> : ''}</td>
                    <td className={styles.actions}>
                      <button type="button" className={styles.btnSmall} onClick={() => startEdit(t)}>Editar</button>
                      <button type="button" className={styles.btnDanger} onClick={() => deleteTrip(t.id)}>Borrar</button>
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
