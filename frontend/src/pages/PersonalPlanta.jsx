import { useState, useEffect } from 'react';
import { api } from '../api';
import styles from './Tables.module.css';

const CANALES = ['whatsapp', 'telegram', 'email'];

export default function PersonalPlanta() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [form, setForm] = useState({ nombre: '', rol: '', telefono: '', email: '', canal_preferido: 'whatsapp' });

  const load = () =>
    api('/api/personal-planta?todos=true').then(setList).catch((e) => setError(e.message));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/personal-planta', { method: 'POST', body: JSON.stringify(form) });
      setForm({ nombre: '', rol: '', telefono: '', email: '', canal_preferido: 'whatsapp' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditData({
      nombre: p.nombre,
      rol: p.rol || '',
      telefono: p.telefono || '',
      email: p.email || '',
      canal_preferido: p.canal_preferido,
      recibir_alertas: p.recibir_alertas,
    });
  };

  const saveEdit = async (id) => {
    setError('');
    setSaving(true);
    try {
      await api(`/api/personal-planta/${id}`, { method: 'PUT', body: JSON.stringify(editData) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (p) => {
    try {
      await api(`/api/personal-planta/${p.id}`, { method: 'PUT', body: JSON.stringify({ activo: !p.activo }) });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    setError('');
    try {
      const token = localStorage.getItem('sarval_token');
      const res = await fetch(`/api/personal-planta/${id}`, {
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

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Personal de planta</h1>
        <button type="button" className={styles.button} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : 'Nuevo'}
        </button>
      </div>
      <p className={styles.muted}>Personas que recibirán notificaciones de alertas (nivel bajo, predicción de vaciado, espera de críticos) vía webhook a n8n.</p>
      {error && <p className={styles.error}>{error}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className={styles.form} style={{ marginBottom: '1.5rem' }}>
          <input placeholder="Nombre *" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className={styles.input} required style={{ minWidth: 150 }} />
          <input placeholder="Rol" value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))} className={styles.input} style={{ minWidth: 120 }} />
          <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className={styles.input} style={{ width: 130 }} />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={styles.input} style={{ minWidth: 160 }} />
          <select value={form.canal_preferido} onChange={(e) => setForm((f) => ({ ...f, canal_preferido: e.target.value }))} className={styles.input}>
            {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" disabled={saving} className={styles.button}>{saving ? 'Guardando…' : 'Crear'}</button>
        </form>
      )}

      {list.length === 0 ? (
        <p className={styles.muted}>No hay personal registrado.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Canal</th>
                <th>Alertas</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td><input value={editData.nombre} onChange={(e) => setEditData((d) => ({ ...d, nombre: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input value={editData.rol} onChange={(e) => setEditData((d) => ({ ...d, rol: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input value={editData.telefono} onChange={(e) => setEditData((d) => ({ ...d, telefono: e.target.value }))} className={styles.inputInline} /></td>
                    <td><input value={editData.email} onChange={(e) => setEditData((d) => ({ ...d, email: e.target.value }))} className={styles.inputInline} /></td>
                    <td>
                      <select value={editData.canal_preferido} onChange={(e) => setEditData((d) => ({ ...d, canal_preferido: e.target.value }))} className={styles.selectInline}>
                        {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="checkbox" checked={editData.recibir_alertas} onChange={(e) => setEditData((d) => ({ ...d, recibir_alertas: e.target.checked }))} />
                    </td>
                    <td />
                    <td className={styles.actions}>
                      <button type="button" className={styles.btnSmall} onClick={() => saveEdit(p.id)} disabled={saving}>Guardar</button>
                      <button type="button" className={styles.btnSmall} onClick={() => setEditingId(null)}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.5 }}>
                    <td>{p.nombre}</td>
                    <td>{p.rol || '—'}</td>
                    <td>{p.telefono || '—'}</td>
                    <td>{p.email || '—'}</td>
                    <td>{p.canal_preferido}</td>
                    <td>{p.recibir_alertas ? 'Sí' : 'No'}</td>
                    <td>
                      <label className={styles.toggleWrap}>
                        <input type="checkbox" checked={!!p.activo} onChange={() => toggleActivo(p)} className={styles.toggleInput} />
                        <span className={styles.toggleSlider} />
                        <span className={styles.toggleLabel}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                      </label>
                    </td>
                    <td className={styles.actions}>
                      <button type="button" className={styles.btnSmall} onClick={() => startEdit(p)}>Editar</button>
                      <button type="button" className={styles.btnDanger} onClick={() => handleDelete(p.id)}>Eliminar</button>
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
