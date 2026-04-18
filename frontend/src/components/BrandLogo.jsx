import { useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function BrandLogo({ variant = 'sidebar' }) {
  const { isDark } = useTheme();
  const [failed, setFailed] = useState(false);

  const src = useMemo(
    () => (isDark ? '/brand/logo-dark.png' : '/brand/logo-light.png'),
    [isDark],
  );

  return (
    <div className={`brand-logo brand-logo--${variant}`}>
      {!failed ? (
        <img
          src={src}
          alt="1 Billion Technology"
          className="brand-logo-image"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="brand-logo-fallback">1 BILLION TECHNOLOGY</span>
      )}
    </div>
  );
}
