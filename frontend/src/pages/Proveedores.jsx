import { useState, useEffect } from 'react';
import { api } from '../api';
import styles from './Tables.module.css';

export default function Proveedores() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);

  const load = () => {
    const q = showInactivos ? '' : '?activo=true';
    return api(`/api/proveedores${q}`).then(setList).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [showInactivos]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const nombre = newNombre.trim();
    if (!nombre) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/proveedores', { method: 'POST', body: JSON.stringify({ nombre }) });
      setNewNombre('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditNombre(p.nombre);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNombre('');
  };

  const saveEdit = async (id) => {
    const nombre = editNombre.trim();
    if (!nombre) return;
    setError('');
    try {
      await api(`/api/proveedores/${id}`, { method: 'PUT', body: JSON.stringify({ nombre }) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const [togglingId, setTogglingId] = useState(null);

  const handleToggleActivo = async (p) => {
    const nextActivo = !p.activo;
    setError('');
    setTogglingId(p.id);
    try {
      await api(`/api/proveedores/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: nextActivo }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Proveedores</h1>
      <p className={styles.muted}>Catálogo para que el bot de Telegram ofrezca esta lista al registrar un chofer. Solo los activos se muestran en el bot.</p>
      {error && <p className={styles.error}>{error}</p>}

      <form onSubmit={handleAdd} className={styles.form} style={{ marginBottom: '1.5rem' }}>
        <input
          placeholder="Nombre del proveedor"
          value={newNombre}
          onChange={(e) => setNewNombre(e.target.value)}
          className={styles.input}
          style={{ minWidth: 220 }}
        />
        <button type="submit" disabled={saving || !newNombre.trim()} className={styles.button}>
          {saving ? 'Guardando…' : 'Añadir'}
        </button>
      </form>

      <label className={styles.checkbox} style={{ marginBottom: '1rem' }}>
        <input type="checkbox" checked={showInactivos} onChange={(e) => setShowInactivos(e.target.checked)} />
        Ver inactivos
      </label>

      {list.length === 0 ? (
        <p className={styles.muted}>No hay proveedores{showInactivos ? '' : ' activos'}.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    {editingId === p.id ? (
                      <input
                        type="text"
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        className={styles.inputInline}
                        autoFocus
                      />
                    ) : (
                      p.nombre
                    )}
                  </td>
                  <td>
                    <label className={styles.toggleWrap} title={p.activo ? 'Activo (clic para desactivar)' : 'Inactivo (clic para activar)'}>
                      <input
                        type="checkbox"
                        checked={!!p.activo}
                        disabled={togglingId === p.id}
                        onChange={() => handleToggleActivo(p)}
                        className={styles.toggleInput}
                      />
                      <span className={styles.toggleSlider} />
                      <span className={styles.toggleLabel}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                    </label>
                  </td>
                  <td className={styles.actions}>
                    {editingId === p.id ? (
                      <>
                        <button type="button" className={styles.btnSmall} onClick={() => saveEdit(p.id)}>Guardar</button>
                        <button type="button" className={styles.btnSmall} onClick={cancelEdit}>Cancelar</button>
                      </>
                    ) : (
                      <button type="button" className={styles.btnSmall} onClick={() => startEdit(p)}>Editar</button>
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
