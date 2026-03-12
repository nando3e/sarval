import { useState, useEffect } from 'react';
import { api } from '../api';
import styles from './Tables.module.css';

const FIELDS = [
  { key: 'Capacidad_silo_tn', label: 'Capacidad silo (tn)' },
  { key: 'Consumo_tn_h', label: 'Consumo (tn/h)' },
  { key: 'Nivel_inicial_tn', label: 'Nivel inicial (tn)' },
  { key: 'Paso_minutos', label: 'Paso (minutos)' },
];

export default function Parametros() {
  const [params, setParams] = useState({});
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/parameters')
      .then((p) => {
        setParams(p);
        setForm(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await api('/api/parameters', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setParams(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Parámetros del silo</h1>
      {error && <p className={styles.error}>{error}</p>}
      <form onSubmit={handleSubmit} className={styles.formVertical}>
        {FIELDS.map(({ key, label }) => (
          <label key={key} className={styles.labelBlock}>
            <span className={styles.labelText}>{label}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form[key] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className={styles.input}
            />
          </label>
        ))}
        <button type="submit" disabled={saving} className={styles.button}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  );
}
