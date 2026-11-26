import React from 'react';
import BrandLogo from './BrandLogo';

const LINKS = [
  { id: 'assessment', label: 'Damage Assessment' },
  { id: 'subsidies', label: 'Aid Options' },
  { id: 'dashboard', label: 'Recovery Dashboard' },
  { id: 'saved', label: 'Saved Applications' }
];

export default function Footer({ onNavigate }) {
  return (
    <footer className="site-footer no-print">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <BrandLogo variant="icon" />
          <strong>Alalai</strong>
          <p>Free disaster-relief navigator. We help you prepare intake forms; we do not give out aid.</p>
        </div>
        <nav aria-label="Footer" className="site-footer-col">
          <h2>Explore</h2>
          {LINKS.map((l) => (
            <button type="button" key={l.id} onClick={() => onNavigate(l.id)}>{l.label}</button>
          ))}
        </nav>
        <div className="site-footer-col">
          <h2>In an emergency</h2>
          <p>National Emergency Hotline: <strong>911</strong></p>
          <p>Philippine Red Cross: <strong>143</strong></p>
        </div>
      </div>
      <div className="site-footer-legal">
        <span>© {new Date().getFullYear()} Alalai. Independent and not affiliated with any government agency.</span>
      </div>
    </footer>
  );
}
