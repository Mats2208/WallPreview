import { Navigate, Outlet } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'

export function ProtectedRoute() {
  const { token } = useWorkspace()
  return token ? <Outlet /> : <Navigate to="/login" replace />
}
