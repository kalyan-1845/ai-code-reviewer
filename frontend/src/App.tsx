import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './layouts/SidebarLayout';

const Dashboard = lazy(() => import('./pages/Dashboard'));

export default function App() {
    return (
      <>
        <BrowserRouter>
            <Routes>
                {/* Wrap all routes inside the SidebarLayout */}
                <Route element={<SidebarLayout />}>

                    {/* Default route redirects to /dashboard */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />

                    {/* The new Analytics Dashboard Route */}
                    <Route 
                        path="/dashboard" 
                        element={
                            <Suspense fallback={
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexGrow: 1,
                                    height: '100%',
                                    minHeight: '400px',
                                    color: 'var(--subtext-color)',
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                        <div className="spinner" style={{
                                            width: '40px',
                                            height: '40px',
                                            border: '3px solid rgba(168, 85, 247, 0.2)',
                                            borderTop: '3px solid #a855f7',
                                            borderRadius: '50%',
                                        }} />
                                        <span style={{ fontSize: '14px', fontWeight: 500 }}>Loading Dashboard...</span>
                                    </div>
                                </div>
                            }>
                                <Dashboard />
                            </Suspense>
                        } 
                    />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />

                </Route>
            </Routes>
        </BrowserRouter>
        <div id="toast-root"></div>
      </>
    );
}

