import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { usePermission } from '../../hooks/usePermission';
import { findNavEntry } from '../layout/navigationConfig';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Result
      status="403"
      title="Access Denied"
      subTitle="You don't have permission to access this page."
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      }
    />
  );
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  const { can, isLoaded } = usePermission();

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

  const navEntry = findNavEntry(location.pathname);
  const requiredPermissions = navEntry?.permissions ?? [];
  if (requiredPermissions.length > 0) {
    const hasAccess = requiredPermissions.some((code) => can(code));
    if (!hasAccess) {
      return <UnauthorizedPage />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
