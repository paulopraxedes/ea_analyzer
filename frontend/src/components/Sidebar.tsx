import { Calendar, LayoutDashboard, Filter, Clock, RefreshCw } from 'lucide-react';

export interface DashboardFilters {
  dateFrom: string;
  dateTo: string;
  selectedAssets: string[];
  selectedEAs: string[];
  selectedDays: string[];
  selectedHours: number[];
  resyncMinutes: number;
}

interface SidebarProps {
  filters: DashboardFilters;
  onFilterChange: (filters: DashboardFilters) => void;
  availableAssets: string[];
  availableEAs: string[];
}

export function Sidebar({ filters, onFilterChange, availableAssets, availableEAs }: SidebarProps) {
  const handleAssetToggle = (asset: string) => {
    let newAssets = [...filters.selectedAssets];
    if (asset === 'Todos') {
      newAssets = ['Todos'];
    } else {
      if (newAssets.includes('Todos')) newAssets = [];
      
      if (newAssets.includes(asset)) {
        newAssets = newAssets.filter(a => a !== asset);
      } else {
        newAssets.push(asset);
      }
      
      if (newAssets.length === 0) newAssets = ['Todos'];
    }
    onFilterChange({ ...filters, selectedAssets: newAssets });
  };

  const handleEAToggle = (ea: string) => {
    let newEAs = [...filters.selectedEAs];
    if (ea === 'Todos') {
      newEAs = ['Todos'];
    } else {
      if (newEAs.includes('Todos')) newEAs = [];
      
      if (newEAs.includes(ea)) {
        newEAs = newEAs.filter(e => e !== ea);
      } else {
        newEAs.push(ea);
      }
      
      if (newEAs.length === 0) newEAs = ['Todos'];
    }
    onFilterChange({ ...filters, selectedEAs: newEAs });
  };

  const handleDayToggle = (day: string) => {
    let newDays = [...filters.selectedDays];
    if (newDays.includes(day)) {
      newDays = newDays.filter(d => d !== day);
    } else {
      newDays.push(day);
    }
    onFilterChange({ ...filters, selectedDays: newDays });
  };

  const handleHourToggle = (hour: number) => {
    let newHours = [...filters.selectedHours];
    if (newHours.includes(hour)) {
      newHours = newHours.filter(h => h !== hour);
    } else {
      newHours.push(hour);
    }
    onFilterChange({ ...filters, selectedHours: newHours });
  };

  return (
    <div style={{
      width: '280px',
      background: '#111',
      borderRight: '1px solid #333',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px',
      position: 'fixed',
      left: 0,
      top: 0,
      overflowY: 'auto',
      zIndex: 10,
      color: '#fff', // High contrast text base
      boxSizing: 'border-box'
    }}>
      <div style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <LayoutDashboard color="#00ff00" />
        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>PAINEL DE FILTROS</h2>
      </div>

      {/* Period Filter */}
      <div className="filter-section" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#e0e0e0' }}>
          <Calendar size={16} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>PERÍODO</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="date" 
            style={inputStyle} 
            value={filters.dateFrom.split('T')[0]} 
            onChange={(e) => onFilterChange({ ...filters, dateFrom: new Date(e.target.value).toISOString() })}
          />
          <input 
            type="date" 
            style={inputStyle} 
            value={filters.dateTo.split('T')[0]} 
            onChange={(e) => onFilterChange({ ...filters, dateTo: new Date(e.target.value).toISOString() })}
          />
        </div>
      </div>

      {/* Assets Filter */}
      <div className="filter-section" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#e0e0e0' }}>
          <Filter size={16} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>ATIVO</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
          {['Todos', ...availableAssets].map(asset => (
            <label key={asset} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={filters.selectedAssets.includes(asset)}
                onChange={() => handleAssetToggle(asset)} 
                style={{ accentColor: '#00ff00' }}
              />
              <span style={{ fontSize: '0.9rem', color: '#fff' }}>{asset}</span>
            </label>
          ))}
        </div>
      </div>

      {/* EAs Filter */}
      <div className="filter-section" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#e0e0e0' }}>
          <Filter size={16} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>EXPERT ADVISOR</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
          {['Todos', ...availableEAs].map(ea => (
            <label key={ea} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={filters.selectedEAs.includes(ea)}
                onChange={() => handleEAToggle(ea)} 
                style={{ accentColor: '#00ff00' }}
              />
              <span style={{ fontSize: '0.9rem', color: '#fff' }}>{ea}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Day of Week Filter */}
      <div className="filter-section" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#e0e0e0' }}>
          <Calendar size={16} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>DIA DA SEMANA</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map(day => {
            const isSelected = filters.selectedDays.includes(day);
            return (
              <button 
                key={day} 
                onClick={() => handleDayToggle(day)}
                style={{
                  ...buttonStyle,
                  background: isSelected ? '#00aaff' : '#333',
                  color: isSelected ? 'white' : '#ccc'
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Filter */}
      <div className="filter-section" style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#e0e0e0' }}>
          <Clock size={16} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>HORÁRIO</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
          {Array.from({ length: 12 }, (_, i) => i + 9).map(hour => {
            const isSelected = filters.selectedHours.includes(hour);
            return (
              <button 
                key={hour} 
                onClick={() => handleHourToggle(hour)}
                style={{
                  ...buttonStyle, 
                  fontSize: '0.8rem',
                  background: isSelected ? '#00aaff' : '#333',
                  color: isSelected ? 'white' : '#ccc'
                }}
              >
                {hour}h
              </button>
            );
          })}
        </div>
      </div>
      
       <div className="filter-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#e0e0e0' }}>
          <RefreshCw size={16} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>RESYNC (MINUTOS)</span>
        </div>
        <input 
          type="number" 
          style={inputStyle} 
          min={1}
          value={filters.resyncMinutes}
          onChange={(e) => onFilterChange({ ...filters, resyncMinutes: Math.max(1, Number(e.target.value)) })} 
        />
      </div>

    </div>
  );
}

const inputStyle = {
  background: '#222',
  border: '1px solid #444',
  color: 'white',
  padding: '8px',
  borderRadius: '4px',
  width: '100%',
  outline: 'none'
};

const buttonStyle = {
  border: 'none',
  padding: '6px 10px',
  borderRadius: '4px',
  fontSize: '0.85rem',
  cursor: 'pointer',
  flex: '1 0 auto',
  transition: 'all 0.2s'
};
