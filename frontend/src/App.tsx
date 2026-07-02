import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './layouts/SidebarLayout';
import Dashboard from './pages/Dashboard';


export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Wrap all routes inside the SidebarLayout */}
                <Route element={<SidebarLayout />}>

                    {/* Default route redirects to /dashboard */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />

                    {/* The new Analytics Dashboard Route */}
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />

                </Route>
            </Routes>
        </BrowserRouter>
    );
}

// TODO: Complete full implementation for #1310 - Enhancement: Add e2e tests using Playwright or Cypress for core user flows
