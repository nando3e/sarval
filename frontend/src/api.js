const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('sarval_token');
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
  return data;
}

function headers() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function appendPlanId(path) {
  const planId = typeof window !== 'undefined' && window.__SARVAL_PLAN_ID;
  if (!planId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}plan_id=${encodeURIComponent(planId)}`;
}

export async function api(path, options = {}) {
  const url = appendPlanId(`${API_BASE}${path}`);
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la petición');
  return data;
}

export function logout() {
  localStorage.removeItem('sarval_token');
  localStorage.removeItem('sarval_user');
  window.location.href = '/';
}
