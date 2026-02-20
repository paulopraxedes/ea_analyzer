# EA Analyzer Web

Plataforma web para análise de performance de operações do MetaTrader 5. O projeto é dividido em um backend FastAPI que consulta dados do MT5 e um frontend React que apresenta dashboards e filtros avançados.

## Visão Geral

- Backend em FastAPI com endpoints para status, conexão e dados
- Frontend em React/Vite com KPIs, gráficos, heatmap e painel do melhor EA
- Resultado Diário com drilldown por ano, mês e dia
- Lista de trades com paginação e seletor de registros por página
- Tabela de posições em tempo real com total de lucro
- Filtros por período, ativo, EA, dia da semana e horário
- Atualização automática configurável por resync em minutos

## Estrutura do Projeto

```
ea_analyzer/
├── backend/          API FastAPI
├── frontend/         Dashboard React/Vite
├── analyzer.py       Aplicação desktop legada
└── README_REFACTOR.md
```

## Pré-requisitos

- Python 3.10+
- Node.js 18+
- MetaTrader 5 instalado e disponível no mesmo host do backend

## Configuração

Crie um arquivo `backend/.env` com as configurações do MT5:

```
MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
MIN_DAYS_FOR_SHARPE=30
```

Se `MT5_PATH` não for definido, o backend tentará usar a configuração padrão do MT5.

### Mapeamento de nomes de EAs (opcional, apenas frontend)

Por padrão, o backend expõe apenas o identificador genérico de cada robô no campo `ea_id`, no formato:

- `Manual` quando o Magic Number é `0`
- `EA 123456` quando o Magic Number é diferente de zero

Para exibir nomes amigáveis em vez de apenas `EA 123456`, você pode criar um arquivo local no frontend:

1. Copie o arquivo de exemplo:

   - De: `frontend/src/config/eaMap.ts`
   - Para: `frontend/src/config/eaMap.ts` (no seu ambiente local, se ainda não existir)

2. Edite o conteúdo para preencher a lista de EAs com seus próprios Magic Numbers:

```ts
export interface EAMapEntry {
  magic_number: number;
  name: string;
}

export interface EAConfig {
  ea: EAMapEntry[];
}

export const EA_CONFIG: EAConfig = {
  ea: [
    { magic_number: 123456, name: 'Meu EA de Tendência' },
    { magic_number: 20250130, name: 'Outro EA Qualquer' }
  ]
};
```

Esse arquivo é utilizado apenas no frontend para converter `EA 123456` em nomes legíveis nas tabelas, filtros e gráficos.  
O arquivo `frontend/src/config/eaMap.ts` está listado em `.gitignore`, portanto seus dados privados não serão enviados para o repositório.

## Como Rodar

### Backend

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```
cd frontend
npm install
npm run dev
```

Abra o navegador em `http://localhost:5173` e clique em Conectar para iniciar a leitura dos dados do MT5.

### Subir Backend e Frontend juntos

```
run_all.bat
```

O script abre duas janelas: uma para o backend (FastAPI) e outra para o frontend (Vite).

## Uso Rápido

1. Configure o período no painel de filtros
2. Selecione ativos e EAs
3. Ajuste os filtros de dias e horários
4. Defina o resync em minutos para atualização automática
5. Navegue pelas abas para visualizar KPIs, gráficos, heatmap e trades

## Endpoints da API

Base URL: `http://127.0.0.1:8000/api/v1`

### Status da Conexão

```
curl http://127.0.0.1:8000/api/v1/status
```

### Conectar ao MT5

```
curl -X POST http://127.0.0.1:8000/api/v1/connect
```

### Buscar Deals

```
curl -X POST http://127.0.0.1:8000/api/v1/deals \
  -H "Content-Type: application/json" \
  -d "{\"date_from\":\"2025-01-01T00:00:00\",\"date_to\":\"2025-01-31T23:59:59\"}"
```

### Métricas

```
curl -X POST http://127.0.0.1:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -d "{\"date_from\":\"2025-01-01T00:00:00\",\"date_to\":\"2025-01-31T23:59:59\"}"
```

## Scripts Úteis (Frontend)

```
npm run dev
npm run build
npm run lint
```

## Solução de Problemas

- MT5 desconectado: verifique o caminho do terminal em `backend/.env` e se o MT5 está aberto
- Falha na API: confirme se o backend está rodando em `http://127.0.0.1:8000`
- Tela em branco: verifique se o frontend está rodando em `http://localhost:5173`

## Contribuição

Diretrizes em [CONTRIBUTING.md](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/CONTRIBUTING.md).

## Código de Conduta

Regras em [CODE_OF_CONDUCT.md](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/CODE_OF_CONDUCT.md).

## Changelog

Histórico de mudanças em [CHANGELOG.md](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/CHANGELOG.md).

## Licença

Este projeto é licenciado sob os termos descritos em [LICENSE](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/LICENSE).
