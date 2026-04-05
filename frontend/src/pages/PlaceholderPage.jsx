/**
 * Placeholder page for unbuilt features.
 */
export default function PlaceholderPage({ title, description }) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '50vh',
      gap: '1rem',
    }}>
      <div style={{
        width: '80px',
        height: '80px',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2rem',
      }}>
        🚧
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>
        {title || 'Coming Soon'}
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '400px', textAlign: 'center' }}>
        {description || 'This feature is under development and will be available in the next sprint.'}
      </p>
    </div>
  );
}
