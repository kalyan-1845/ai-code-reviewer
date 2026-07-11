import React from 'react';

const DashboardFooter: React.FC = () => {
  return (
    <footer
      style={{
        marginTop: "auto",
        background: "rgba(15, 23, 42, 0.4)",
        padding: "12px 24px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "11px",
        color: "#9ca3af",
      }}
    >
      <span>
        RepoSage AI © 2026. Made with 💜 for GirlScript Summer of Code
        (GSSoC).
      </span>
      <div style={{ display: "flex", gap: "16px" }}>
        <span>Mentors: Kalyan Reddy Bhoompally</span>
        <span>Status: Production MVP Ready</span>
      </div>
    </footer>
  );
};

export default DashboardFooter;
