import React, { useState, useEffect } from 'react';
import './OnboardingHint.css';

export const OnboardingHint: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem('oceanx_seen_intro');
      if (!seen) {
        // Small delay so user sees globe render first
        const timer = setTimeout(() => setVisible(true), 1200);
        // Auto-hide after 12s so the one-time tooltip never permanently
        // covers interactive UI (e.g. the AI guide panel) on small viewports.
        const autoHide = setTimeout(() => setVisible(false), 13200);
        return () => {
          clearTimeout(timer);
          clearTimeout(autoHide);
        };
      }
    } catch {
      // Ignore localStorage availability issues
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem('oceanx_seen_intro', 'true');
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="onboarding-hint-card" role="region" aria-label="Quick orientation tips">
      <div className="onboarding-hint-header">
        <span className="onboarding-icon">🧭</span>
        <span className="onboarding-title">TACTICAL NAVIGATION GUIDE</span>
        <button
          className="onboarding-close-x"
          onClick={handleDismiss}
          aria-label="Dismiss guide"
        >
          ✕
        </button>
      </div>
      <p className="onboarding-hint-text">
        <strong>Click and drag</strong> to rotate the 3D globe. <strong>Left-click</strong> any coordinate to inspect subsurface temperature and salinity. Press <kbd>L</kbd> for scientific layer rail, and <kbd>?</kbd> for hotkey shortcuts.
      </p>
      <div className="onboarding-hint-actions">
        <button className="onboarding-gotit-btn" onClick={handleDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
};

export default OnboardingHint;
