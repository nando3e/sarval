import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { logout, api } from '../api';
import { useTheme } from '../context/ThemeContext';
import { useBranding } from '../context/BrandingContext';
import WeekSelector from './WeekSelector';
import SimulationBanner from './SimulationBanner';
import styles from './Layout.module.css';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/planificacion', label: 'Planificación' },
  { to: '/viajes-extras', label: 'Viajes extras' },
  { to: '/secuenciacion', label: 'Secuenciación' },
  { to: '/tolvas', label: 'Tolvas' },
  { to: '/productividad', label: 'Productividad' },
  { to: '/paradas', label: 'Paradas' },
  { to: '/boxes', label: 'Boxes' },
  { to: '/personal-planta', label: 'Personal planta' },
  { to: '/proveedores', label: 'Proveedores' },
  { to: '/choferes', label: 'Choferes' },
  { to: '/configuracion', label: 'Configuración' },
];

function getInitials(user) {
  if (!user) return '?';
  const name = user.email || user.name || '';
  return name.slice(0, 2).toUpperCase() || '?';
}

export default function Layout() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { appName, anonimizar, setAnonimizar } = useBranding();
  const [savingAnon, setSavingAnon] = useState(false);

  const handleToggleAnon = async () => {
    const next = !anonimizar;
    setSavingAnon(true);
    setAnonimizar(next);
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ anonimizar: next }) });
    } catch (err) {
      setAnonimizar(!next);
      console.error('No se pudo guardar el modo anonimizado:', err);
    } finally {
      setSavingAnon(false);
    }
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('sarval_user')); } catch { return null; }
  })();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>{appName}</div>
        <WeekSelector />
        <nav className={styles.nav}>
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? styles.navActive : styles.navLink)}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Menú de usuario */}
        <div className={styles.userArea} ref={menuRef}>
          <button
            type="button"
            className={styles.userBtn}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <span className={styles.avatar}>{getInitials(user)}</span>
            <span className={styles.userName}>{user?.email || 'Usuario'}</span>
            <span className={styles.chevron}>{menuOpen ? '▲' : '▼'}</span>
          </button>

          {menuOpen && (
            <div className={styles.userMenu}>
              <div className={styles.userMenuHeader}>
                <span className={styles.userMenuRole}>
                  {user?.role === 'superadmin' ? 'Superadministrador' : 'Usuario'}
                </span>
                <span className={styles.userMenuEmail}>{user?.email}</span>
              </div>
              <div className={styles.userMenuDivider} />
              <div className={styles.userMenuRow}>
                <span className={styles.userMenuLabel}>
                  {theme === 'dark' ? '🌙 Modo oscuro' : '☀️ Modo claro'}
                </span>
                <button
                  type="button"
                  className={styles.themeToggle}
                  onClick={toggleTheme}
                  aria-label="Cambiar tema"
                >
                  <span className={`${styles.themeThumb} ${theme === 'light' ? styles.themeThumbOn : ''}`} />
                </button>
              </div>
              {user?.role === 'superadmin' && (
                <>
                  <div className={styles.userMenuDivider} />
                  <div className={styles.userMenuRow}>
                    <span className={styles.userMenuLabel}>
                      {anonimizar ? '🕶️ Modo demo (anonimizado)' : '🏷️ Modo demo (anonimizado)'}
                    </span>
                    <button
                      type="button"
                      className={styles.themeToggle}
                      onClick={handleToggleAnon}
                      disabled={savingAnon}
                      aria-label="Modo demo anonimizado"
                    >
                      <span className={`${styles.themeThumb} ${anonimizar ? styles.themeThumbOn : ''}`} />
                    </button>
                  </div>
                </>
              )}
              <div className={styles.userMenuDivider} />
              <button type="button" className={styles.userMenuLogout} onClick={handleLogout}>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className={styles.main}>
        <SimulationBanner />
        <Outlet />
      </main>
    </div>
  );
}
