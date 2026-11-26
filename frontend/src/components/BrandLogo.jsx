import React from 'react';
import wordmark from '../assets/alalai-logo.png';
import wordmarkDark from '../assets/alalai-logo-dark.png';
import icon from '../assets/alalai-icon.png';
import iconDark from '../assets/alalai-icon-dark.png';

// The navy parts of the logo disappear on a dark background, so a light variant is
// swapped in by the theme (see .brand-img-light / .brand-img-dark in index.css).
export default function BrandLogo({ variant = 'wordmark', className = '' }) {
  const light = variant === 'icon' ? icon : wordmark;
  const dark = variant === 'icon' ? iconDark : wordmarkDark;

  return (
    <span className={`brand-img brand-img--${variant} ${className}`.trim()}>
      <img className="brand-img-light" src={light} alt="Alalai" />
      <img className="brand-img-dark" src={dark} alt="" aria-hidden="true" />
    </span>
  );
}
