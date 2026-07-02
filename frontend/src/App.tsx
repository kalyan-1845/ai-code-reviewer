import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { Suspense } from 'react';
import SidebarLayout from './layouts/SidebarLayout';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));

export default function App() {
    return (
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
                            <Suspense fallback={<div style={{ padding: '24px', color: '#fff' }}>Loading...</div>}>
                                <Dashboard />
                            </Suspense>
                        } 
                    />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />

                </Route>
            </Routes>
        </BrowserRouter>
    );
}
