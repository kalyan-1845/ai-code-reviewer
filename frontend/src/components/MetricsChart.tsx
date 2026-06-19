import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// Dummy Data to be replaced with actual API response
const dummyData = [
  { month: 'Jan', bugs: 12, security: 4 },
  { month: 'Feb', bugs: 8, security: 2 },
  { month: 'Mar', bugs: 15, security: 5 },
  { month: 'Apr', bugs: 5, security: 0 },
];

export const MetricsChart: React.FC = () => {
  return (
    <div 
      className="chart-container" 
      style={{ 
        width: '100%', 
        height: 350, 
        backgroundColor: '#1e293b', 
        padding: '20px', 
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.05)'
      }}
    >
      <h3 style={{ color: '#a855f7', marginTop: 0, marginBottom: '20px' }}>
        Codebase Metrics Overview
      </h3>
      <ResponsiveContainer width="100%" height="80%">
        <LineChart data={dummyData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#f1f5f9' }} 
            itemStyle={{ color: '#e2e8f0' }}
          />
          <Line type="monotone" dataKey="bugs" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="security" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};