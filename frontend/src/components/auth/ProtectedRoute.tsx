import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { usePermission } from '../../hooks/usePermission';
import { resolveRoutePermissions, getFirstPermittedRoute } from '../layout/navigationConfig';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const UnauthorizedPage: React.FC<{ fallbackPath: string }> = ({ fallbackPath }) => {
  const navigate = useNavigate();
  const label = fallbackPath === '/dashboard' ? 'Back to Dashboard' : 'Go to Home Page';
  return (
    <Result
      status="403"
      title="Access Denied"
      subTitle="You don't have permission to access this page."
      extra={
        <Button type="primary" onClick={() => navigate(fallbackPath)}>
          {label}
        </Button>
      }
    />
  );
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const { can, isLoaded } = usePermission();

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin size="large" />
      </div>
    );
  }

  const requiredPermissions = resolveRoutePermissions(location.pathname);
  if (requiredPermissions.length > 0) {
    const hasAccess = requiredPermissions.some((code) => can(code));
    if (!hasAccess) {
      return <UnauthorizedPage fallbackPath={getFirstPermittedRoute(can)} />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
