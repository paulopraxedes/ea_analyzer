import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import type { DashboardFilters } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import './App.css'

interface TerminalInfo {
  name: string;
  path: string;
  server: string;
  company: string;
}

interface ConnectionStatus {
  connected: boolean;
  terminal_info: TerminalInfo | null;
}

function App() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Available options loaded from data
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [availableEAs, setAvailableEAs] = useState<string[]>([]);

  // Centralized Filter State
  const now = new Date()
  const [filters, setFilters] = useState<DashboardFilters>({
    dateFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    dateTo: now.toISOString(),
    selectedAssets: ['Todos'],
    selectedEAs: ['Todos'],
    selectedDays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    selectedHours: Array.from({ length: 12 }, (_, i) => i + 9), // 9h to 20h default
    resyncMinutes: 1
  });

  const arraysEqual = (a: string[], b: string[]) => {
    if (a === b) return true
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  const handleDataLoaded = useCallback((assets: string[], eas: string[]) => {
    setAvailableAssets(prev => (arraysEqual(prev, assets) ? prev : assets))
    setAvailableEAs(prev => (arraysEqual(prev, eas) ? prev : eas))
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/status')
      const data = await response.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError('Erro ao conectar com o servidor Backend')
      console.error(err)
    }
  }

  const connectMT5 = async () => {
    setLoading(true)
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/connect', {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Falha ao conectar')
      await fetchStatus()
    } catch (err) {
      setError('Erro ao conectar ao MT5')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  return (
    <div className="app-container" style={{ minHeight: '100vh', background: '#000' }}>
      <Sidebar 
        filters={filters} 
        onFilterChange={setFilters} 
        availableAssets={availableAssets}
        availableEAs={availableEAs}
      />
      
      <div style={{ marginLeft: '280px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '1rem 2rem', 
          borderBottom: '1px solid #333',
          background: '#0a0a0a',
          position: 'sticky',
          top: 0,
          zIndex: 5
        }}>
          <h1 style={{ 
            fontSize: '1.8rem', 
            margin: 0, 
            color: '#00aaff', 
            fontWeight: '700',
            letterSpacing: '1px',
            textShadow: '0 0 10px rgba(0, 170, 255, 0.3)'
          }}>
            EA Analyzer Web
          </h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
             <span style={{
                color: status?.connected ? '#00ff00' : '#ff9800', 
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}>
                {status?.connected ? '● MT5 CONECTADO' : '○ MT5 DESCONECTADO'}
              </span>
              {!status?.connected && (
                <button onClick={connectMT5} disabled={loading} style={{ 
                  padding: '0.5rem 1rem',
                  background: '#00aaff',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: 'pointer'
                }}>
                  {loading ? '...' : 'Conectar'}
                </button>
              )}
          </div>
        </header>

        <main style={{ padding: '2rem', flex: 1, background: '#050505' }}>
          {error && <div className="error-banner" style={{ background: '#ff444433', padding: '1rem', borderRadius: '4px', marginBottom: '1rem', color: '#ff8888' }}>{error}</div>}
          
          {status?.connected ? (
            <Dashboard filters={filters} onDataLoaded={handleDataLoaded} />
          ) : (
            <div className="connect-prompt" style={{ textAlign: 'center', marginTop: '4rem' }}>
              <h2>Conecte-se ao MetaTrader 5 para visualizar a análise</h2>
              <p style={{ color: '#888' }}>Certifique-se que o terminal MT5 está aberto.</p>
              <button onClick={connectMT5} disabled={loading} style={{ 
                marginTop: '1rem', 
                fontSize: '1.2rem', 
                padding: '1rem 2rem',
                background: '#00aaff',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer'
              }}>
                {loading ? 'Conectando...' : 'Conectar Agora'}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
