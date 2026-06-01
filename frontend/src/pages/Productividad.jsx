import { useState, useEffect } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import styles from './Tables.module.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const toHHmm = (v) => String(v ?? '').slice(0, 5);
const toMin = (hhmm) => {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
};

// Ventana de CONSUMO base: del Lunes `startMin` (def 06:00=360) al Sábado
// `endMin` (def 22:00=1320), continua incluidas las noches. El Domingo queda
// fuera de la ventana base. Fuera de la ventana no hay consumo base, pero una
// franja activa el consumo en su tramo (se pinta verde igualmente).
function isOperating(day, minute, startMin = 360, endMin = 1320) {
  if (day === 'Lunes') return minute >= startMin;
  if (day === 'Sábado') return minute < endMin;
  if (day === 'Domingo') return false;
  return true;
}

// Calcula los segmentos de un día: tramos contiguos con estado homogéneo
// ('fuera' | 'base' | 'custom' con rate). Solapamientos → gana mayor id.
function daySegments(day, periods, baseRate, startMin = 360, endMin = 1320) {
  const dayPeriods = periods
    .filter((p) => p.dia === day)
    .map((p) => ({ start: toMin(p.hora_inicio), end: toMin(p.hora_fin), rate: Number(p.consumo_tn_h), id: Number(p.id) || 0 }))
    .filter((p) => p.end > p.start);

  const bounds = new Set([0, 1440, startMin, endMin]);
  for (const p of dayPeriods) { bounds.add(p.start); bounds.add(p.end); }
  const sorted = [...bounds].filter((b) => b >= 0 && b <= 1440).sort((a, b) => a - b);

  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b <= a) continue;
    const mid = (a + b) / 2;
    let state, rate;
    if (!isOperating(day, mid, startMin, endMin)) {
      state = 'fuera';
    } else {
      // franja de mayor id que cubre el punto medio
      const covering = dayPeriods.filter((p) => p.start <= mid && mid < p.end).sort((x, y) => y.id - x.id)[0];
      if (covering) { state = 'custom'; rate = covering.rate; }
      else { state = 'base'; rate = baseRate; }
    }
    const last = segs[segs.length - 1];
    if (last && last.state === state && last.rate === rate) {
      last.b = b;
    } else {
      segs.push({ a, b, state, rate });
    }
  }
  return segs;
}

function segStyle(state) {
  if (state === 'fuera') {
    return { background: 'repeating-linear-gradient(45deg, var(--border), var(--border) 6px, transparent 6px, transparent 12px)', opacity: 0.5 };
  }
  if (state === 'base') {
    return { background: 'rgba(148, 163, 184, 0.18)' }; // gris suave sólido
  }
  return { background: '#14b8a6' }; // custom
}

const DAY_TO_IDX = { Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5, Domingo: 6 };

// Eje de horas (00h..24h) centrado bajo cada línea; se usa arriba y abajo del calendario.
function HourAxis() {
  return (
    <div style={{ position: 'relative', height: 16, marginLeft: 88 }}>
      {Array.from({ length: 25 }, (_, h) => h).map((h) => {
        const transform = h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)';
        return (
          <span key={h} style={{ position: 'absolute', left: `${(h / 24) * 100}%`, transform, fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{String(h).padStart(2, '0')}h</span>
        );
      })}
    </div>
  );
}

// "Ahora" dentro de la semana operativa: {dayIdx (Lunes=0..Domingo=6), min}
function nowCutoff() {
  const d = new Date();
  return { dayIdx: (d.getDay() + 6) % 7, min: d.getHours() * 60 + d.getMinutes() };
}

export default function Productividad() {
  const { planId, weeks } = usePlan();
  const { tolvas } = useTolvas();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterTolva, setFilterTolva] = useState('');
  const [form, setForm] = useState({ tolva_id: '', dia: 'Lunes', hora_inicio: '06:00', hora_fin: '14:00', consumo_tn_h: '' });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  // Override de la semana por tolva: solo nivel inicial (la ventana de consumo
  // va en Tolvas; ampliarla puntualmente se hace con franjas).
  const [weekSettings, setWeekSettings] = useState([]);
  const [wsForm, setWsForm] = useState({ nivel_inicial_tn: '' });
  const [savingWs, setSavingWs] = useState(false);

  const isPastWeek = weeks?.pasadas?.some((p) => p.id === planId);
  // Semana vigente: aplica el corte en "ahora" (no se edita lo ya pasado).
  const isVigente = planId == null || weeks?.vigente?.id === planId;
  const cutoff = nowCutoff();

  // ¿La franja empieza antes de "ahora"? (solo relevante en semana vigente)
  const startsInPast = (dia, horaInicio) => {
    if (!isVigente) return false;
    const di = DAY_TO_IDX[dia];
    if (di == null) return false;
    const sm = toMin(horaInicio);
    return di < cutoff.dayIdx || (di === cutoff.dayIdx && sm < cutoff.min);
  };

  const load = () => {
    const q = filterTolva ? `?tolva_id=${filterTolva}` : '';
    return api(`/api/productivity-periods${q}`)
      .then(setList)
      .catch((e) => setError(e.message));
  };

  const loadWeekSettings = () =>
    api('/api/plan-tolva-settings')
      .then(setWeekSettings)
      .catch(() => setWeekSettings([]));

  useEffect(() => {
    setLoading(true);
    Promise.all([load(), loadWeekSettings()]).finally(() => setLoading(false));
  }, [planId, filterTolva]);

  useEffect(() => {
    if (tolvas.length > 0 && !form.tolva_id) {
      setForm((f) => ({ ...f, tolva_id: String(tolvas[0].id) }));
    }
  }, [tolvas]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (form.consumo_tn_h === '') return;
    if (startsInPast(form.dia, form.hora_inicio)) {
      setError('No puedes crear una franja que empieza en un momento ya pasado de esta semana. Para ajustar de ahora en adelante, usa una hora futura.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api('/api/productivity-periods', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      setForm((f) => ({ ...f, consumo_tn_h: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditData({ dia: p.dia, hora_inicio: toHHmm(p.hora_inicio), hora_fin: toHHmm(p.hora_fin), consumo_tn_h: p.consumo_tn_h });
  };
  const cancelEdit = () => { setEditingId(null); setEditData({}); };
  const saveEdit = async (id) => {
    setError('');
    try {
      await api(`/api/productivity-periods/${id}`, { method: 'PUT', body: JSON.stringify(editData) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    setError('');
    try {
      await api(`/api/productivity-periods/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const showTolvaCol = tolvas.length > 1;

  // Tolva para el calendario / overrides: la filtrada, o la primera.
  const calTolvaId = filterTolva ? Number(filterTolva) : (tolvas[0]?.id ?? null);
  const calSettings = weekSettings.find((w) => w.tolva_id === calTolvaId) || null;

  // Sincroniza el formulario con el override de nivel inicial guardado para la
  // tolva en foco. Vacío = "heredar de Tolvas".
  useEffect(() => {
    setWsForm({
      nivel_inicial_tn: calSettings?.override_nivel_inicial_tn != null ? String(calSettings.override_nivel_inicial_tn) : '',
    });
  }, [calTolvaId, weekSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveWs = async () => {
    if (!calTolvaId) return;
    setSavingWs(true);
    setError('');
    try {
      await api('/api/plan-tolva-settings', {
        method: 'PUT',
        body: JSON.stringify({
          tolva_id: calTolvaId,
          nivel_inicial_tn: wsForm.nivel_inicial_tn === '' ? null : Number(wsForm.nivel_inicial_tn),
        }),
      });
      await Promise.all([loadWeekSettings(), load()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingWs(false);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  const calTolva = tolvas.find((t) => t.id === calTolvaId) || null;
  const baseRate = calTolva && calTolva.consumo_tn_h != null ? Number(calTolva.consumo_tn_h) : 12;
  const calPeriods = list.filter((p) => p.tolva_id === calTolvaId);

  // Ventana de consumo de la tolva (igual para todas las semanas).
  const startMin = toMin(toHHmm(calTolva?.hora_inicio_consumo ?? '06:00'));
  const endMin = toMin(toHHmm(calTolva?.hora_fin_consumo ?? '22:00'));
  // Nivel inicial efectivo de la semana (override ?? defecto tolva).
  const effNivelInicial = calSettings?.override_nivel_inicial_tn ?? calSettings?.default_nivel_inicial_tn ?? 0;
  const hasOverride = calSettings && calSettings.override_nivel_inicial_tn != null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Productividad</h1>
        {showTolvaCol && (
          <select value={filterTolva} onChange={(e) => setFilterTolva(e.target.value)} className={styles.input} style={{ minWidth: 140 }}>
            {tolvas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
            ))}
          </select>
        )}
        {!isPastWeek && (
          <button type="button" className={styles.button} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancelar' : 'Nueva franja'}
          </button>
        )}
      </div>

      <p className={styles.muted}>
        Caudal base de {calTolva ? (calTolva.nombre || `Tolva ${calTolva.numero}`) : 'la tolva'}: <strong>{baseRate} t/h</strong> (editable en Tolvas).
        Las franjas de abajo sustituyen ese caudal en su tramo. En solapamientos manda la franja más reciente.
        {isPastWeek && <span style={{ color: 'var(--danger)' }}> · Semana pasada: solo lectura.</span>}
      </p>
      {error && <p className={styles.error}>{error}</p>}

      {/* Override de la semana por tolva: solo nivel inicial. La ventana de
          consumo (inicio Lunes / fin Sábado) va en Tolvas; ampliar el finde se
          hace con franjas más abajo. */}
      {calTolva && (
        <div style={{ margin: '0.5rem 0 1rem', padding: '0.85rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Nivel inicial de esta semana · {calTolva.nombre || `Tolva ${calTolva.numero}`}</strong>
            <label style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '0.75rem', color: 'var(--text-muted)', gap: 2 }}>
              Nivel inicial (tn)
              <input type="number" min="0" step="0.1" value={wsForm.nivel_inicial_tn} disabled={isPastWeek} placeholder={String(Number(calSettings?.default_nivel_inicial_tn ?? 0))}
                onChange={(e) => setWsForm((f) => ({ ...f, nivel_inicial_tn: e.target.value }))}
                className={styles.input} style={{ width: 120 }} />
              <span style={{ fontSize: '0.68rem' }}>Defecto tolva: {Number(calSettings?.default_nivel_inicial_tn ?? 0)}</span>
            </label>
            {!isPastWeek && (
              <button type="button" className={styles.button} onClick={saveWs} disabled={savingWs}>
                {savingWs ? 'Guardando…' : 'Guardar y recalcular'}
              </button>
            )}
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Vacío = hereda el nivel inicial de Tolvas. Solo afecta a <strong>esta semana</strong> y a esta tolva.
            Ventana de consumo: <strong>{toHHmm(calTolva.hora_inicio_consumo ?? '06:00')}</strong> (Lun) → <strong>{toHHmm(calTolva.hora_fin_consumo ?? '22:00')}</strong> (Sáb), editable en Tolvas. Para consumir el finde, añade una franja.
            {hasOverride && <span style={{ color: '#14b8a6', fontWeight: 600 }}> · Override de nivel activo.</span>}
            {isPastWeek && <span style={{ color: 'var(--danger)' }}> · Semana pasada: solo lectura.</span>}
          </p>
        </div>
      )}

      {/* Calendario visual de cobertura */}
      <div style={{ margin: '1rem 0 1.5rem', padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ width: 16, height: 12, borderRadius: 2, background: '#14b8a6' }} /> Franja específica</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ width: 16, height: 12, borderRadius: 2, ...segStyle('base') }} /> Caudal base (sin franja)</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><span style={{ width: 16, height: 12, borderRadius: 2, ...segStyle('fuera') }} /> Fuera de operación</span>
        </div>
        <HourAxis />
        {DAYS.map((day) => {
          const segs = daySegments(day, calPeriods, baseRate, startMin, endMin);
          const showNow = isVigente && DAY_TO_IDX[day] === cutoff.dayIdx;
          return (
            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
              <span style={{ width: 80, fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>{day}</span>
              <div style={{ position: 'relative', flex: 1, height: 30, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {segs.map((s, i) => (
                  <div
                    key={i}
                    title={s.state === 'custom' ? `${Math.floor(s.a/60)}:${String(s.a%60).padStart(2,'0')}–${Math.floor(s.b/60)}:${String(s.b%60).padStart(2,'0')} · ${s.rate} t/h` : s.state === 'base' ? `Caudal base ${s.rate} t/h` : 'Fuera de operación'}
                    style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${(s.a / 1440) * 100}%`, width: `${((s.b - s.a) / 1440) * 100}%`,
                      ...segStyle(s.state),
                    }}
                  />
                ))}
                {/* Líneas verticales discontinuas en cada hora */}
                {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                  <div key={`hl-${h}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(h / 24) * 100}%`, borderLeft: '1px dashed rgba(71,85,105,0.7)', pointerEvents: 'none' }} />
                ))}
                {/* Número de t/h en cada celda de hora (caudal efectivo en el centro de la hora) */}
                {Array.from({ length: 24 }, (_, h) => {
                  const seg = segs.find((s) => s.a <= h * 60 + 30 && h * 60 + 30 < s.b);
                  if (!seg || seg.state === 'fuera') return null;
                  return (
                    <div key={`n-${h}`} style={{
                      position: 'absolute', top: 0, bottom: 0, left: `${(h / 24) * 100}%`, width: `${(1 / 24) * 100}%`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.68rem', fontWeight: 600, color: seg.state === 'custom' ? '#08312c' : 'var(--text-muted)', pointerEvents: 'none',
                    }}>
                      {Number(seg.rate)}
                    </div>
                  );
                })}
                {/* Marcador "ahora" en el día actual */}
                {showNow && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(cutoff.min / 1440) * 100}%`, borderLeft: '2px solid #ef4444', pointerEvents: 'none' }} title="Ahora" />
                )}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 2 }}>
          <HourAxis />
        </div>
      </div>

      {showForm && !isPastWeek && (
        <form onSubmit={handleAdd} className={styles.form} style={{ marginBottom: '1.5rem' }}>
          {showTolvaCol && (
            <label className={styles.labelBlock}>
              <span className={styles.labelText}>Tolva</span>
              <select value={form.tolva_id} onChange={(e) => setForm((f) => ({ ...f, tolva_id: e.target.value }))} className={styles.input} style={{ minWidth: 130 }}>
                {tolvas.map((t) => <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>)}
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
            <span className={styles.labelText}>Caudal (t/h)</span>
            <input type="number" min="0" step="0.1" value={form.consumo_tn_h} onChange={(e) => setForm((f) => ({ ...f, consumo_tn_h: e.target.value }))} className={styles.input} style={{ width: 110 }} required />
          </label>
          <button type="submit" disabled={saving} className={styles.button} style={{ alignSelf: 'flex-end' }}>{saving ? 'Guardando…' : 'Crear y recalcular'}</button>
        </form>
      )}

      {list.length === 0 ? (
        <p className={styles.muted}>No hay franjas de productividad. Todo el tiempo operativo usa el caudal base de cada tolva.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {showTolvaCol && <th>Tolva</th>}
                <th>Día</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th>Caudal (t/h)</th>
                {!isPastWeek && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                editingId === p.id ? (
                  <tr key={p.id}>
                    {showTolvaCol && <td>{p.tolva_nombre || `Tolva ${p.tolva_numero}`}</td>}
                    <td>
                      <select value={editData.dia} onChange={(e) => setEditData((d) => ({ ...d, dia: e.target.value }))} className={styles.selectInline}>
                        {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td><input type="time" value={editData.hora_inicio} onChange={(e) => setEditData((d) => ({ ...d, hora_inicio: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input type="time" value={editData.hora_fin} onChange={(e) => setEditData((d) => ({ ...d, hora_fin: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input type="number" min="0" step="0.1" value={editData.consumo_tn_h} onChange={(e) => setEditData((d) => ({ ...d, consumo_tn_h: e.target.value }))} className={styles.inputInline} style={{ width: 70 }} /></td>
                    <td className={styles.actions}>
                      <button type="button" className={styles.btnSmall} onClick={() => saveEdit(p.id)}>Guardar</button>
                      <button type="button" className={styles.btnSmall} onClick={cancelEdit}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} style={startsInPast(p.dia, p.hora_inicio) ? { opacity: 0.55 } : undefined}>
                    {showTolvaCol && <td>{p.tolva_nombre || `Tolva ${p.tolva_numero}`}</td>}
                    <td>{p.dia}</td>
                    <td>{toHHmm(p.hora_inicio)}</td>
                    <td>{toHHmm(p.hora_fin)}</td>
                    <td>{p.consumo_tn_h}</td>
                    {!isPastWeek && (
                      <td className={styles.actions}>
                        {startsInPast(p.dia, p.hora_inicio) ? (
                          <span className={styles.muted} style={{ fontSize: '0.8rem' }} title="Tramo ya pasado: bloqueado para no alterar la historia. Para cambiar de ahora en adelante, añade una franja nueva.">🔒 Pasada</span>
                        ) : (
                          <>
                            <button type="button" className={styles.btnSmall} onClick={() => startEdit(p)}>Editar</button>
                            <button type="button" className={styles.btnDanger} onClick={() => handleDelete(p.id)}>Eliminar</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
