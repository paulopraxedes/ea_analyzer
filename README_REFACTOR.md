# Refatoração do EA Analyzer: Arquitetura Moderna

Este documento detalha a nova estrutura do projeto, migrando de uma aplicação Monolítica Tkinter para uma arquitetura Web Moderna (Client-Server).

## Estrutura do Projeto

```
ea_analyzer/
├── backend/                # API REST (Python/FastAPI)
│   ├── app/
│   │   ├── api/            # Endpoints da API
│   │   ├── core/           # Configurações
│   │   ├── models/         # Schemas de Dados (Pydantic)
│   │   └── services/       # Lógica de Negócios (MT5, Cálculos)
│   ├── requirements.txt    # Dependências do Backend
│   └── .env                # Variáveis de Ambiente
├── frontend/               # Dashboard Web (React/Vite/TypeScript)
├── analyzer.py             # (Legado) Aplicação Desktop Antiga
└── README_REFACTOR.md      # Este arquivo
```

## Backend (API)

O backend foi reescrito utilizando **FastAPI**, focando em performance e separação de responsabilidades.

### Principais Componentes:
- **MT5Service**: Serviço singleton responsável pela conexão com MetaTrader 5 e extração de dados.
- **Endpoints**:
  - `GET /api/v1/status`: Verifica conexão com MT5.
  - `POST /api/v1/connect`: Força conexão.
  - `POST /api/v1/deals`: Busca histórico de trades com filtros.
  - `POST /api/v1/metrics`: Calcula métricas de performance (Sharpe, Drawdown, etc.).

### Como Rodar o Backend:

1. Instale as dependências:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. Execute o servidor:
   ```bash
   uvicorn app.main:app --reload
   ```
   O servidor iniciará em `http://localhost:8000`.
   Documentação automática (Swagger) disponível em `http://localhost:8000/docs`.

## Frontend (Dashboard)

O frontend foi inicializado com **React + TypeScript + Vite**.

### Próximos Passos Sugeridos para o Frontend:
1. Instalar bibliotecas de UI e gráficos:
   ```bash
   cd frontend
   npm install axios recharts lucide-react @radix-ui/react-slot class-variance-authority clsx tailwind-merge
   ```
2. Desenvolver componentes para consumir a API do Backend.

### Como Rodar o Frontend:

1. Instale as dependências (se ainda não fez):
   ```bash
   cd frontend
   npm install
   ```

2. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   Acesse em `http://localhost:5173`.

## Benefícios da Nova Arquitetura

1. **Desacoplamento**: A lógica de análise (Backend) está separada da visualização (Frontend).
2. **Robustez**: O Backend pode rodar como um serviço background, mais estável que uma janela Tkinter.
3. **Modernidade**: O Frontend React permite interfaces muito mais ricas e interativas.
4. **Escalabilidade**: Fácil adicionar novos endpoints ou integrar com outros serviços.
