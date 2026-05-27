import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import { shortDate, getWeekStart } from '../utils/dates';
import styles from './Tables.module.css';

const toHHmm = (v) => String(v ?? '').slice(0, 5);
const DAY_IDX = { Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5 };

function plannedStep(day, hora, paso) {
  const STEPS_H = 60 / paso;
  const d = DAY_IDX[day];
  if (d == null) return null;
  const [hh, mm] = String(hora).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return d * 24 * STEPS_H + hh * STEPS_H + Math.round(mm / paso);
}

// Definición de columnas. `always: true` => no se puede ocultar.
// `requiresMultiTolva: true` => solo se muestra cuando hay >1 tolva.
const COLUMN_DEFS = [
  { key: 'trip_number', label: 'Nº viaje', always: true },
  { key: 'tolva', label: 'Tolva', requiresMultiTolva: true },
  { key: 'day', label: 'Día' },
  { key: 'hora_prevista', label: 'Hora prev.' },
  { key: 'supplier', label: 'Proveedor' },
  { key: 'producto', label: 'Producto' },
  { key: 'tons', label: 'Ton' },
  { key: 'critico', label: 'Crítico' },
  { key: 'retraso_h', label: 'Retraso llegada (h)' },
  { key: 'nueva_hora', label: 'Nueva hora' },
  { key: 'estado', label: 'Estado' },
  { key: 'extra', label: 'Extra' },
  { key: 'dia_final', label: 'Día final' },
  { key: 'hora_final', label: 'Hora final' },
  { key: 'retraso', label: 'Retraso (h)' },
  { key: 'nivel_previo', label: 'Nivel previo (tn)' },
  { key: 'desviar', label: 'Acciones', always: true },
];

const STORAGE_KEY = 'sarval_secuenciacion_visible_columns';

function loadVisible() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export default function Secuenciacion() {
  const { planId, weeks } = usePlan();
  const { tolvas } = useTolvas();
  const weekStart = getWeekStart(planId, weeks);
  const [sequence, setSequence] = useState([]);
  const [simulation, setSimulation] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recalculating, setRecalculating] = useState(false);
  const [filterTolva, setFilterTolva] = useState('');
  const [divertingId, setDivertingId] = useState(null);
  const [divertTarget, setDivertTarget] = useState('');
  const [divertBusy, setDivertBusy] = useState(false);
  const [visible, setVisible] = useState(loadVisible);
  const [showColumns, setShowColumns] = useState(false);
  const columnsRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  // Persistir visibilidad
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
    } catch {}
  }, [visible]);

  // Cerrar popover al clicar fuera
  useEffect(() => {
    if (!showColumns) return;
    const onDown = (e) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target)) {
        setShowColumns(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showColumns]);

  const load = () => {
    const q = filterTolva ? `?tolva_id=${filterTolva}` : '';
    return Promise.all([
      api(`/api/planning/sequence${q}`),
      api(`/api/planning/simulation${q}`).catch(() => []),
    ])
      .then(([seq, sim]) => {
        setSequence(seq);
        setSimulation(sim);
      })
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

  const startEdit = (row) => {
    // Cancelar cualquier edición/divert previo
    setDivertingId(null);
    setEditingId(row.id);
    setEditData({
      day: row.day,
      hora_prevista: toHHmm(row.hora_prevista),
      supplier: row.supplier || '',
      producto: row.producto || '',
      tons: row.tons,
      is_critical: !!row.critico,
      retraso_h: row.retraso_h == null ? '' : String(row.retraso_h),
      nueva_hora: toHHmm(row.nueva_hora),
      estado: row.estado || 'pending',
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };
  const saveEdit = async (tripId) => {
    setError('');
    try {
      const body = {
        day: editData.day,
        scheduled_time: editData.hora_prevista,
        supplier: editData.supplier,
        producto: editData.producto,
        tons: Number(editData.tons),
        is_critical: !!editData.is_critical,
      };
      if (editData.retraso_h !== '' && !Number.isNaN(Number(editData.retraso_h))) body.delay_h = Number(editData.retraso_h);
      if (editData.nueva_hora) body.new_time = editData.nueva_hora;
      if (editData.estado) body.status = editData.estado;
      await api(`/api/trips/${tripId}`, { method: 'PUT', body: JSON.stringify(body) });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const startDivert = (row) => {
    setEditingId(null);
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

  // Mapa de nivel "antes de entradas" por (tolva_id, step_index).
  // silo_level (guardado tras añadir entradas) menos entries_tons = nivel al inicio del paso.
  const levelBeforeMap = new Map();
  for (const s of simulation) {
    const key = `${s.tolva_id}:${s.step_index}`;
    const lvl = Number(s.silo_level) - Number(s.entries_tons);
    levelBeforeMap.set(key, lvl);
  }

  const isVisible = (key) => {
    const def = COLUMN_DEFS.find((c) => c.key === key);
    if (!def) return true;
    if (def.always) {
      if (def.requiresMultiTolva && !showTolvaCol) return false;
      return true;
    }
    if (def.requiresMultiTolva && !showTolvaCol) return false;
    // Por defecto visible si no hay valor guardado
    return visible[key] !== false;
  };

  const toggleVisible = (key) => {
    setVisible((prev) => ({ ...prev, [key]: !(prev[key] !== false) }));
  };

  const toggleableColumns = COLUMN_DEFS.filter((c) => !c.always && (!c.requiresMultiTolva || showTolvaCol));

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
        <div ref={columnsRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setShowColumns((v) => !v)} className={styles.btnSmall} style={{ padding: '0.5rem 0.75rem' }}>
            Columnas
          </button>
          {showColumns && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.5rem 0.75rem', minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}>
              {toggleableColumns.map((c) => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visible[c.key] !== false} onChange={() => toggleVisible(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={handleRecalculate} disabled={recalculating} className={styles.button}>
          {recalculating ? 'Recalculando…' : 'Actualizar'}
        </button>
      </div>

      {(retainedCount > 0 || delayedCount > 0) && (
        <p className={styles.muted} style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          {delayedCount > 0 && <span style={{ color: 'var(--danger)', marginRight: '1rem' }}>{delayedCount} viaje(s) con retraso</span>}
          {retainedCount > 0 && <span style={{ color: '#f59e0b' }}>{retainedCount} viaje(s) retenido(s) para dejar espacio a un crítico</span>}
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
                {isVisible('trip_number') && <th>Nº viaje</th>}
                {isVisible('tolva') && <th>Tolva</th>}
                {isVisible('day') && <th>Día</th>}
                {isVisible('hora_prevista') && <th>Hora prev.</th>}
                {isVisible('supplier') && <th>Proveedor</th>}
                {isVisible('producto') && <th>Producto</th>}
                {isVisible('tons') && <th>Ton</th>}
                {isVisible('critico') && <th title="Si el viaje es crítico (prioridad alta).">Crítico</th>}
                {isVisible('retraso_h') && <th title="Retraso (en horas) que el chófer o el bot ha reportado para la llegada de este viaje. Se rellena manualmente o desde Telegram. NOTA: hoy no recalcula automáticamente la secuenciación.">Retraso llegada (h)</th>}
                {isVisible('nueva_hora') && <th title="Nueva hora prevista de llegada cuando el chófer comunica un cambio respecto a la planificada. NOTA: hoy no recalcula la secuenciación.">Nueva hora</th>}
                {isVisible('estado') && <th title="Estado operativo del viaje: pendiente, confirmado por el chófer, en ruta, llegado, etc. Se actualizará automáticamente cuando el bot esté conectado.">Estado</th>}
                {isVisible('extra') && <th title="Indica si el viaje no estaba en la planificación base y se ha añadido durante la semana.">Extra</th>}
                {isVisible('dia_final') && <th title="Día en que el motor de simulación calcula que el camión descargará realmente.">Día final</th>}
                {isVisible('hora_final') && <th title="Hora en que el motor de simulación calcula que el camión descargará realmente.">Hora final</th>}
                {isVisible('retraso') && <th title="Horas entre la hora prevista y la descarga real. Puede venir tanto de falta de espacio en el silo como de espera para dejar paso a un crítico.">Retraso (h)</th>}
                {isVisible('nivel_previo') && <th title="Nivel del silo al inicio del paso correspondiente a la hora prevista de este viaje. Incluye el efecto de los boxes. Permite ver de un vistazo si hubo o no hueco cuando el camión llegó.">Nivel previo (tn)</th>}
                {isVisible('desviar') && <th className={styles.stickyActions}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {sequence.map((row) => {
                const retCap = Number(row.retraso_capacidad_h) || 0;
                const retained = !!row.retenido_por_critico;
                const isDiverting = divertingId === row.id;
                const isEditing = editingId === row.id;
                const otherTolvas = tolvas.filter((t) => t.id !== row.tolva_id);
                const rowClasses = [];
                if (isEditing) rowClasses.push(styles.rowEditing);
                else if (retained) rowClasses.push(styles.rowRetained);
                else if (retCap > 0) rowClasses.push(styles.rowDelay);
                else if (dayChanged(row)) rowClasses.push(styles.rowDayChange);
                const tolvaCfg = tolvas.find((t) => t.id === row.tolva_id);
                const paso = tolvaCfg?.paso_minutos || 30;
                const pStep = plannedStep(row.day, row.hora_prevista, paso);
                const levelBefore = pStep != null ? levelBeforeMap.get(`${row.tolva_id}:${pStep}`) : null;
                return (
                  <tr key={row.id} className={rowClasses.join(' ')}>
                    {isVisible('trip_number') && <td>{row.trip_number}</td>}
                    {isVisible('tolva') && <td>{row.tolva_nombre || `Tolva ${row.tolva_numero || '?'}`}</td>}
                    {isVisible('day') && <td>{isEditing ? (
                      <select value={editData.day} onChange={(e) => setEditData((d) => ({ ...d, day: e.target.value }))} className={styles.selectInline}>
                        {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    ) : <>{row.day}{weekStart ? ` ${shortDate(weekStart, row.day)}` : ''}</>}</td>}
                    {isVisible('hora_prevista') && <td>{isEditing ? (
                      <input type="time" value={editData.hora_prevista} onChange={(e) => setEditData((d) => ({ ...d, hora_prevista: e.target.value }))} className={styles.inputInline} style={{ width: 90 }} />
                    ) : toHHmm(row.hora_prevista)}</td>}
                    {isVisible('supplier') && <td>{isEditing ? (
                      <input value={editData.supplier} onChange={(e) => setEditData((d) => ({ ...d, supplier: e.target.value }))} className={styles.inputInline} style={{ width: 160 }} />
                    ) : row.supplier}</td>}
                    {isVisible('producto') && <td>{isEditing ? (
                      <input value={editData.producto} onChange={(e) => setEditData((d) => ({ ...d, producto: e.target.value }))} className={styles.inputInline} style={{ width: 120 }} />
                    ) : (row.producto || '—')}</td>}
                    {isVisible('tons') && <td>{isEditing ? (
                      <input type="number" min="0" step="0.1" value={editData.tons} onChange={(e) => setEditData((d) => ({ ...d, tons: e.target.value }))} className={styles.inputInline} style={{ width: 70 }} />
                    ) : row.tons}</td>}
                    {isVisible('critico') && <td>{isEditing ? (
                      <input type="checkbox" checked={!!editData.is_critical} onChange={(e) => setEditData((d) => ({ ...d, is_critical: e.target.checked }))} />
                    ) : (row.critico ? <span className={styles.chipCritical}>Sí</span> : '')}</td>}
                    {isVisible('retraso_h') && <td>{isEditing ? (
                      <input type="number" min="0" step="0.1" value={editData.retraso_h} onChange={(e) => setEditData((d) => ({ ...d, retraso_h: e.target.value }))} className={styles.inputInline} style={{ width: 60 }} />
                    ) : (row.retraso_h != null && Number(row.retraso_h) > 0 ? Number(row.retraso_h).toFixed(1) : '')}</td>}
                    {isVisible('nueva_hora') && <td>{isEditing ? (
                      <input type="time" value={editData.nueva_hora} onChange={(e) => setEditData((d) => ({ ...d, nueva_hora: e.target.value }))} className={styles.inputInline} style={{ width: 90 }} />
                    ) : toHHmm(row.nueva_hora)}</td>}
                    {isVisible('estado') && <td>{isEditing ? (
                      <select value={editData.estado} onChange={(e) => setEditData((d) => ({ ...d, estado: e.target.value }))} className={styles.selectInline}>
                        <option value="pending">pending</option>
                        <option value="confirmed">confirmed</option>
                        <option value="in_route">in_route</option>
                        <option value="arrived">arrived</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    ) : (row.estado !== 'pending' ? row.estado : '')}</td>}
                    {isVisible('extra') && <td>{row.viaje_extra ? 'Sí' : ''}</td>}
                    {isVisible('dia_final') && <td>{row.dia_final}{weekStart && row.dia_final ? ` ${shortDate(weekStart, row.dia_final)}` : ''}</td>}
                    {isVisible('hora_final') && <td>{toHHmm(row.hora_final)}</td>}
                    {isVisible('retraso') && <td>{retCap > 0 ? retCap.toFixed(2) : ''}</td>}
                    {isVisible('nivel_previo') && <td>{levelBefore != null ? levelBefore.toFixed(1) : ''}</td>}
                    {isVisible('desviar') && (
                      <td className={styles.stickyActions}>
                        <span className={styles.actions}>
                          {isEditing ? (
                            <>
                              <button type="button" className={styles.btnSmall} onClick={() => saveEdit(row.trip_id)}>Guardar</button>
                              <button type="button" className={styles.btnSmall} onClick={cancelEdit}>Cancelar</button>
                            </>
                          ) : isDiverting ? (
                            <>
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
                            </>
                          ) : (
                            <>
                              <button type="button" className={styles.btnSmall} onClick={() => startEdit(row)} title="Editar este viaje sin ir a Planificación">Editar</button>
                              {otherTolvas.length > 0 && (
                                <button type="button" className={styles.btnSmall} onClick={() => startDivert(row)} title="Desviar a otra tolva">
                                  Desviar
                                </button>
                              )}
                            </>
                          )}
                        </span>
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
