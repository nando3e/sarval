import { useState, useEffect } from 'react';
import { api } from '../api';
import styles from './Tables.module.css';

export default function Choferes() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ telegram_id: '', nombre_chofer: '', telefono: '' });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ nombre_chofer: '', telefono: '' });

  const load = () =>
    api('/api/telegram-drivers').then(setList).catch((e) => setError(e.message));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const tid = form.telegram_id.trim();
    const nombre = form.nombre_chofer.trim();
    if (!tid || !nombre) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/telegram-drivers', {
        method: 'POST',
        body: JSON.stringify({
          telegram_id: tid,
          nombre_chofer: nombre,
          telefono: form.telefono.trim() || undefined,
        }),
      });
      setForm({ telegram_id: '', nombre_chofer: '', telefono: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    setEditData({
      nombre_chofer: d.nombre_chofer,
      telefono: d.telefono || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ nombre_chofer: '', telefono: '' });
  };

  const saveEdit = async (id) => {
    setError('');
    try {
      await api(`/api/telegram-drivers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre_chofer: editData.nombre_chofer.trim(),
          telefono: editData.telefono.trim() || null,
        }),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este chofer?')) return;
    setError('');
    try {
      await api(`/api/telegram-drivers/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Choferes (Telegram)</h1>
      <p className={styles.muted}>Puedes añadir y editar aquí; normalmente el registro se hace desde el bot en n8n.</p>
      {error && <p className={styles.error}>{error}</p>}

      <form onSubmit={handleAdd} className={styles.form} style={{ marginBottom: '1.5rem' }}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Telegram ID"
          value={form.telegram_id}
          onChange={(e) => setForm((f) => ({ ...f, telegram_id: e.target.value.replace(/\D/g, '') }))}
          className={styles.input}
          style={{ width: 140 }}
        />
        <input
          placeholder="Nombre"
          value={form.nombre_chofer}
          onChange={(e) => setForm((f) => ({ ...f, nombre_chofer: e.target.value }))}
          className={styles.input}
          style={{ minWidth: 160 }}
        />
        <input
          placeholder="Teléfono (opcional)"
          value={form.telefono}
          onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
          className={styles.input}
          style={{ width: 140 }}
        />
        <button type="submit" disabled={saving || !form.telegram_id.trim() || !form.nombre_chofer.trim()} className={styles.button}>
          {saving ? 'Guardando…' : 'Añadir'}
        </button>
      </form>

      {list.length === 0 ? (
        <p className={styles.muted}>Aún no hay choferes registrados.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Telegram ID</th>
                <th>Teléfono</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td>
                    {editingId === d.id ? (
                      <input
                        value={editData.nombre_chofer}
                        onChange={(e) => setEditData((x) => ({ ...x, nombre_chofer: e.target.value }))}
                        className={styles.inputInline}
                        autoFocus
                      />
                    ) : (
                      d.nombre_chofer
                    )}
                  </td>
                  <td>{d.telegram_id}</td>
                  <td>
                    {editingId === d.id ? (
                      <input
                        value={editData.telefono}
                        onChange={(e) => setEditData((x) => ({ ...x, telefono: e.target.value }))}
                        className={styles.inputInline}
                        placeholder="opcional"
                        style={{ width: 120 }}
                      />
                    ) : (
                      d.telefono || '—'
                    )}
                  </td>
                  <td className={styles.actions}>
                    {editingId === d.id ? (
                      <>
                        <button type="button" className={styles.btnSmall} onClick={() => saveEdit(d.id)}>Guardar</button>
                        <button type="button" className={styles.btnSmall} onClick={cancelEdit}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className={styles.btnSmall} onClick={() => startEdit(d)}>Editar</button>
                        <button type="button" className={styles.btnDanger} onClick={() => handleDelete(d.id)}>Borrar</button>
                      </>
                    )}
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
