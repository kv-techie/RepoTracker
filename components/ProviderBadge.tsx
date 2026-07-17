interface ProviderBadgeProps {
  provider: 'ollama' | 'gemini' | 'local';
}

export default function ProviderBadge({ provider }: ProviderBadgeProps) {
  if (provider === 'local') return null;

  return (
    <div 
      className="provider-badge" 
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12,
        color: 'var(--gray-300)',
        fontFamily: 'var(--font-inter)'
      }}
    >
      <span style={{ opacity: 0.7 }}>Generated via:</span>
      <span style={{ fontWeight: 600, color: provider === 'ollama' ? '#3B82F6' : '#8B5CF6' }}>
        {provider === 'ollama' ? 'Ollama' : 'Gemini'}
      </span>
    </div>
  );
}
