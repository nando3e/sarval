import { useState, useEffect, useRef } from 'react';
import { api, appendPlanId } from '../api';
import { usePlan } from '../context/PlanContext';
import styles from './Tables.module.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function Planificacion() {
  const { planId } = usePlan();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const fileRef = useRef(null);

  const load = () =>
    api('/api/trips')
      .then(setTrips)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [planId]);

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
      tons: trip.tons,
      is_critical: trip.is_critical,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (id) => {
    try {
      await api(`/api/trips/${id}`, { method: 'PUT', body: JSON.stringify(editData) });
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

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Planificación</h1>

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
        <p className={styles.muted}>Primera fila: cabecera. Filas siguientes: un viaje por línea. Días: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado. Hora: HH:MM. Crítico: Sí/Si o vacío.</p>
        <pre className={styles.csvExampleBlock}>
{`ID;Día;Hora;Proveedor;Toneladas;Crítico
1;Lunes;07:00;PROVEEDOR A;22,5;
2;Lunes;09:30;PROVEEDOR B;18;Sí
3;Martes;08:00;PROVEEDOR A;20;`}
        </pre>
        <p className={styles.csvExampleNote}>En CSV puedes usar separador <code>;</code> o <code>,</code>. En Excel usa las mismas columnas (Día, Hora, Proveedor, Toneladas, Crítico).</p>
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
                <th>#</th>
                <th>Día</th>
                <th>Hora</th>
                <th>Proveedor</th>
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
                    <td>
                      <select value={editData.day} onChange={(e) => setEditData((d) => ({ ...d, day: e.target.value }))} className={styles.selectInline}>
                        {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td><input type="time" value={editData.scheduled_time} onChange={(e) => setEditData((d) => ({ ...d, scheduled_time: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input value={editData.supplier} onChange={(e) => setEditData((d) => ({ ...d, supplier: e.target.value }))} className={styles.inputInline} /></td>
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
                    <td>{t.day}</td>
                    <td>{String(t.scheduled_time ?? '').slice(0, 5)}</td>
                    <td>{t.supplier}</td>
                    <td>{t.tons}</td>
                    <td>{t.is_critical ? 'Sí' : 'No'}</td>
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
