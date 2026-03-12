import { useState, useEffect } from 'react';
import { api } from '../api';
import styles from './Configuracion.module.css';

function CopyButton({ value, label = 'Copiar' }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" className={styles.copyBtn} onClick={copy} title={value}>
      {done ? 'Copiado' : label}
    </button>
  );
}

export default function Configuracion() {
  const [settings, setSettings] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('general');

  // Form state
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [webhookForm, setWebhookForm] = useState({ name: '', url: '', events: [] });
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const [s, w, e] = await Promise.all([
        api('/api/settings'),
        api('/api/webhooks'),
        api('/api/webhooks/events'),
      ]);
      setSettings(s);
      setTimezone(s.timezone || 'Europe/Madrid');
      setApiBaseUrl(s.api_base_url || '');
      setWebhooks(w);
      setEvents(e);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ timezone, api_base_url: apiBaseUrl }) });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEvent = (key) => {
    setWebhookForm((f) => ({
      ...f,
      events: f.events.includes(key) ? f.events.filter((e) => e !== key) : [...f.events, key],
    }));
  };

  const handleAddWebhook = async (e) => {
    e.preventDefault();
    if (!webhookForm.url.trim()) {
      setError('URL del webhook es obligatoria');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api('/api/webhooks', {
        method: 'POST',
        body: JSON.stringify({ name: webhookForm.name.trim(), url: webhookForm.url.trim(), events: webhookForm.events }),
      });
      setWebhookForm({ name: '', url: '', events: [] });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateWebhook = async (id, data) => {
    setSaving(true);
    setError('');
    try {
      await api(`/api/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!confirm('¿Eliminar este webhook?')) return;
    try {
      await api(`/api/webhooks/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('sarval_token') : '';
  const authHeader = token ? `Authorization: Bearer ${token}` : '';

  if (loading) return <p className={styles.muted}>Cargando…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Configuración</h1>

      <nav className={styles.tabs}>
        <button type="button" className={activeSection === 'general' ? styles.tabActive : styles.tab} onClick={() => setActiveSection('general')}>
          General
        </button>
        <button type="button" className={activeSection === 'api' ? styles.tabActive : styles.tab} onClick={() => setActiveSection('api')}>
          API e integraciones
        </button>
        <button type="button" className={activeSection === 'webhooks' ? styles.tabActive : styles.tab} onClick={() => setActiveSection('webhooks')}>
          Webhooks salientes
        </button>
      </nav>

      {error && <p className={styles.error}>{error}</p>}

      {activeSection === 'general' && (
        <section className={styles.section}>
          <h2 className={styles.h2}>General</h2>
          <p className={styles.muted}>Zona horaria para la planta (Europa). Afecta a los timestamps enviados en webhooks.</p>
          <form onSubmit={handleSaveGeneral} className={styles.form}>
            <label className={styles.label}>
              Zona horaria
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={styles.select}>
                {(settings?.timezone_options || []).map((tz) => (
                  <option key={tz} value={tz}>{tz.replace('Europe/', '')}</option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              URL base de la API (opcional)
              <input type="url" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} className={styles.input} placeholder="https://tu-dominio.com" />
            </label>
            <p className={styles.muted}>Si la dejas vacía, se usará la URL actual. Úsala para que los endpoints que copias apunten a producción.</p>
            <button type="submit" disabled={saving} className={styles.button}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </form>
        </section>
      )}

      {activeSection === 'api' && (
        <section className={styles.section}>
          <h2 className={styles.h2}>API para integraciones</h2>
          <p className={styles.muted}>Copia y pega en n8n u otras herramientas para configurar llamadas a la API.</p>

          <div className={styles.block}>
            <h3 className={styles.h3}>Token (JWT)</h3>
            <div className={styles.row}>
              <code className={styles.code}>{token ? `${token.slice(0, 30)}…` : 'Inicia sesión para ver el token'}</code>
              {token && <CopyButton value={token} label="Copiar token" />}
            </div>
          </div>

          <div className={styles.block}>
            <h3 className={styles.h3}>Cabecera de autorización</h3>
            <div className={styles.row}>
              <code className={styles.code}>{authHeader || '—'}</code>
              {authHeader && <CopyButton value={authHeader} label="Copiar cabecera" />}
            </div>
          </div>

          <div className={styles.block}>
            <h3 className={styles.h3}>Endpoints (URLs a las que llamar)</h3>
            <p className={styles.muted}>Todas las rutas requieren la cabecera <code>Authorization: Bearer &lt;token&gt;</code> excepto POST /api/auth/login.</p>
            <ul className={styles.endpointList}>
              {(settings?.endpoints || []).map((ep, i) => (
                <li key={i} className={styles.endpointItem}>
                  <span className={styles.method}>{ep.method}</span>
                  <code className={styles.url}>{ep.url}</code>
                  <span className={styles.desc}>{ep.description}</span>
                  <CopyButton value={ep.url} label="Copiar URL" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {activeSection === 'webhooks' && (
        <section className={styles.section}>
          <h2 className={styles.h2}>Webhooks salientes</h2>
          <p className={styles.muted}>La app enviará un POST a cada URL cuando ocurran los eventos seleccionados (ej. a n8n).</p>

          <div className={styles.webhookList}>
            {webhooks.map((w) => (
              <div key={w.id} className={styles.webhookCard}>
                {editingId === w.id ? (
                  <WebhookEditForm
                    webhook={w}
                    events={events}
                    onSave={(data) => handleUpdateWebhook(w.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                ) : (
                  <>
                    <div className={styles.webhookHead}>
                      <strong>{w.name || 'Sin nombre'}</strong>
                      <span className={styles.webhookUrl}>{w.url}</span>
                    </div>
                    <div className={styles.eventTags}>
                      {(w.events || []).map((ev) => {
                        const label = events.find((e) => e.key === ev)?.label || ev;
                        return <span key={ev} className={styles.tag}>{label}</span>;
                      })}
                    </div>
                    <div className={styles.webhookActions}>
                      <button type="button" className={styles.btnSmall} onClick={() => setEditingId(w.id)}>Editar</button>
                      <button type="button" className={styles.btnDanger} onClick={() => handleDeleteWebhook(w.id)}>Eliminar</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleAddWebhook} className={styles.form}>
            <h3 className={styles.h3}>Añadir webhook</h3>
            <label className={styles.label}>
              Nombre (opcional)
              <input type="text" value={webhookForm.name} onChange={(e) => setWebhookForm((f) => ({ ...f, name: e.target.value }))} className={styles.input} placeholder="Ej. n8n producción" />
            </label>
            <label className={styles.label}>
              URL del webhook *
              <input type="url" value={webhookForm.url} onChange={(e) => setWebhookForm((f) => ({ ...f, url: e.target.value }))} className={styles.input} placeholder="https://..." required />
            </label>
            <div className={styles.label}>
              Eventos que disparan el webhook
              <div className={styles.eventGrid}>
                {events.map((ev) => (
                  <label key={ev.key} className={styles.checkLabel}>
                    <input type="checkbox" checked={webhookForm.events.includes(ev.key)} onChange={() => toggleEvent(ev.key)} />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={saving} className={styles.button}>Añadir webhook</button>
          </form>
        </section>
      )}
    </div>
  );
}

function WebhookEditForm({ webhook, events, onSave, onCancel, saving }) {
  const [name, setName] = useState(webhook.name || '');
  const [url, setUrl] = useState(webhook.url || '');
  const [evs, setEvs] = useState(webhook.events || []);

  const toggle = (key) => {
    setEvs((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]));
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ name, url, events: evs }); }} className={styles.form}>
      <label className={styles.label}>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={styles.input} />
      </label>
      <label className={styles.label}>
        URL
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={styles.input} required />
      </label>
      <div className={styles.label}>
        Eventos
        <div className={styles.eventGrid}>
          {events.map((ev) => (
            <label key={ev.key} className={styles.checkLabel}>
              <input type="checkbox" checked={evs.includes(ev.key)} onChange={() => toggle(ev.key)} />
              {ev.label}
            </label>
          ))}
        </div>
      </div>
      <div className={styles.formActions}>
        <button type="submit" disabled={saving} className={styles.button}>Guardar</button>
        <button type="button" className={styles.btnSecondary} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
