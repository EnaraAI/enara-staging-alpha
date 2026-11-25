import React from 'react';

// "Glow" logo for the ENARA Parents and ENARA Bus apps: the ENARA mark (four
// quarter circles) with the star between them lit in amber, beside "Enara"
// over the product word. The main ENARA logo (EnaraLogo.tsx) is unchanged and
// stays everywhere else. Quarters and words use the current text colour.
// The Poppins 600 wordmark font is loaded in index.html.
export const GlowMark: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <rect width="100" height="100" fill="#F59E0B" />
    <g fill="currentColor">
      <path d="M0 0H50A50 50 0 0 1 0 50Z" />
      <path d="M100 0V50A50 50 0 0 1 50 0Z" />
      <path d="M100 100H50A50 50 0 0 1 100 50Z" />
      <path d="M0 100V50A50 50 0 0 1 50 100Z" />
    </g>
  </svg>
);

type Props = { product: 'Parents' | 'Bus'; size?: number; className?: string };

export const GlowLogo: React.FC<Props> = ({ product, size = 32, className }) => (
  <span className={`glow-logo${className ? ` ${className}` : ''}`} role="img" aria-label={`Enara ${product}`} dir="ltr" data-testid={`glow-logo-${product.toLowerCase()}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), color: 'inherit' }}>
    <GlowMark size={size} />
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.02, fontFamily: "Poppins, Inter, system-ui, sans-serif", fontWeight: 600, fontSize: Math.round(size * 0.44), letterSpacing: '-0.01em' }}>
      <span>Enara</span><span>{product}</span>
    </span>
  </span>
);

export default GlowLogo;
