import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  color?: string; // Hex color for the value or accent
  size?: 'small' | 'large';
}

export function KPICard({ title, value, color = '#fff', size = 'small', icon: Icon }: KPICardProps) {
  return (
    <div style={{
      background: '#1e1e1e',
      padding: '20px', // Padronizado
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      border: '1px solid #333',
      width: '100%',
      minHeight: '120px', // Altura mínima consistente
      overflow: 'hidden', // Evita invasão de componentes
      position: 'relative'
    }}>
      {Icon && (
        <div style={{ position: 'absolute', top: '12px', left: '12px', color: '#666' }}>
          <Icon size={18} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '12px', width: '100%' }}>
        <span style={{ color: '#bbb', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </span>
      </div>
      
      <div style={{ 
        fontSize: size === 'large' ? '1.8rem' : '1.4rem', // Ajustado para evitar excessos
        fontWeight: 'bold', 
        color: color,
        wordBreak: 'break-word', // Quebra valores longos
        lineHeight: '1.2',
        textAlign: 'center',
        width: '100%'
      }}>
        {value}
      </div>
    </div>
  );
}
