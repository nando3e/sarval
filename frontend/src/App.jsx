import { Routes, Route, Navigate } from 'react-router-dom';
import { PlanProvider } from './context/PlanContext';
import { TolvaProvider } from './context/TolvaContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Planificacion from './pages/Planificacion';
import ViajesExtras from './pages/ViajesExtras';
import Secuenciacion from './pages/Secuenciacion';
import Tolvas from './pages/Tolvas';
import Configuracion from './pages/Configuracion';
import Proveedores from './pages/Proveedores';
import Choferes from './pages/Choferes';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('sarval_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <PlanProvider>
              <TolvaProvider>
                <Layout />
              </TolvaProvider>
            </PlanProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="planificacion" element={<Planificacion />} />
        <Route path="viajes-extras" element={<ViajesExtras />} />
        <Route path="secuenciacion" element={<Secuenciacion />} />
        <Route path="tolvas" element={<Tolvas />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="choferes" element={<Choferes />} />
        <Route path="configuracion" element={<Configuracion />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ThemeProvider>
  );
}
