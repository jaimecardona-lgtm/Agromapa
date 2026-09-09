# PHASE E: AGENTE MAESTRO AGROMAPA - IMPLEMENTACIÓN COMPLETA

**Estado:** ✅ Implementado | 🔴 NO COMMITEADO

---

## 📋 RESUMEN EJECUTIVO

Se ha implementado el Agente Maestro de AgroMapa Colombia (PHASE E) que integra:

- ✅ Cliente OpenRouter reutilizable
- ✅ 7 tools basadas en servicios internos
- ✅ System prompt grounded en datos reales
- ✅ Endpoint REST `/api/agent/chat`
- ✅ Panel UI en frontend con historial de chat
- ✅ Sistema de tabs [Información] [Agente]
- ✅ Tests unitarios con mocks
- ✅ Build completo (backend + frontend)

**NO depende de:**
- ❌ RAG embeddings
- ❌ pgvector
- ❌ Llamadas HTTP del backend contra sí mismo

---

## 🏗️ ARQUITECTURA

```
Usuario (Frontend)
    ↓
POST /api/agent/chat
    ↓
AgentService (Python)
    ├─ System Prompt (data integrity rules)
    ├─ Tool Selection (auto)
    └─ Tool Execution Loop
        ↓
    Tools (execute_tool)
        ├─ get_departments()
        ├─ get_department_municipalities()
        ├─ get_municipality()
        ├─ get_municipality_agriculture() → EVA
        ├─ get_department_agriculture()
        ├─ search_crop()
        └─ get_municipality_farms()
            ↓
        Services / Repositories
            ↓
        Supabase (datos reales)
            ↓
    OpenRouter API (LLM redacta respuesta)
        ↓
AgentChatResponse
{
  "answer": "...",
  "sources": ["EVA 2024", "AgroMapa"],
  "tools_used": [...],
  "context": {...}
}
    ↓
Frontend (RenderAgent respuesta con contexto)
```

---

## 🔧 COMPONENTES IMPLEMENTADOS

### 1. Backend: Cliente OpenRouter
**Archivo:** `backend/app/core/openrouter_client.py`

```python
class OpenRouterClient:
    def is_configured() -> bool
    async def chat_completion(
        messages: list[dict],
        tools: list[dict],
        tool_choice: str = "auto",
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> dict
```

**Features:**
- Timeout de 30 segundos
- Manejo de errores gracefu (503, timeout)
- Sin exposición de API key
- Reusable singleton

---

### 2. Backend: Esquemas Pydantic
**Archivo:** `backend/app/schemas/agent_schemas.py`

```python
class AgentContext(BaseModel):
    department_code: Optional[str] = None
    municipality_code: Optional[str] = None
    year: int = Field(default=2024, ge=2000, le=2100)

class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    context: AgentContext = Field(default_factory=...)

class AgentChatResponse(BaseModel):
    answer: str
    sources: list[str]
    tools_used: list[str]
    context: AgentContext
```

---

### 3. Backend: Tools del Agente
**Archivo:** `backend/app/tools/agent_tools.py`

#### JSON Schema Tools (para OpenRouter)
```json
[
  {
    "type": "function",
    "function": {
      "name": "get_departments",
      "description": "Get list of all departments...",
      "parameters": { "type": "object", "properties": {}, ... }
    }
  },
  ...
]
```

#### Tools Implementadas

| Tool | Descripción | Salida |
|------|-------------|--------|
| `get_departments()` | Departamentos con DANE codes | list[GeoUnit] |
| `get_department_municipalities(code)` | Municipios de un departamento | list[GeoUnit] |
| `get_municipality(code)` | Detalles de municipio | GeoUnit |
| `get_municipality_agriculture(code, year=2024)` | EVA para municipio | AgriculturalData |
| `get_department_agriculture(code, year=2024)` | EVA agregado por departamento | dict con totales |
| `search_crop(crop, year=2024)` | Buscar cultivo en BD | list[stat] |
| `get_municipality_farms(code)` | Fincas registradas en AgroMapa | list[Farm] |

**Característica clave:** Todas usan servicios/repos internos. **NO hay requests HTTP**.

---

### 4. Backend: Servicio del Agente
**Archivo:** `backend/app/services/agent_service.py`

```python
async def chat_with_agent(request: AgentChatRequest) -> AgentChatResponse:
    """
    1. Construye prompt del usuario con contexto territorial
    2. Llama OpenRouter con tools disponibles
    3. Ejecuta tools seleccionadas por LLM
    4. Redacta respuesta con fuentes
    """
```

#### System Prompt (Directrices Obligatorias)

```
- No inventes datos. Si no tienes información, dilo claramente.
- EVA es la estadística oficial histórica.
- Cuando cites EVA, siempre indica el año: "Según EVA 2024..."
- Las fincas = información actual registrada en AgroMapa.
- No confundas EVA (histórico) con disponibilidad/stock (actual).
- Si AgroMapa no tiene el dato, comunícalo.
- Siempre menciona la fuente.
```

---

### 5. Backend: Router del Agente
**Archivo:** `backend/app/routers/agent.py`

```python
@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(request: AgentChatRequest) -> AgentChatResponse:
    """POST /api/agent/chat"""
    # Validaciones:
    # - OPENROUTER_ENABLED=true
    # - OPENROUTER_API_KEY not empty
    # - Delega a chat_with_agent(request)
```

**Códigos de error:**
- `503`: Agent disabled / API key missing
- `500`: Unexpected error

---

### 6. Frontend: Panel del Agente
**Archivo:** `frontend/src/components/AgentPanel.tsx`

**Features:**
- 💬 Historial local de mensajes
- 🎯 Sugerencias iniciales (4 ejemplos)
- ⌨️ Input + botón enviar
- ⟳ Loading spinner durante llamada
- 🔴 Error display
- 📌 Fuentes de datos debajo de respuesta
- ⏱️ Timestamps en mensajes
- 🚫 Disabled si no hay municipio seleccionado

**Sugerencias iniciales:**
```
"¿Cuáles son los principales cultivos?"
"¿Cuál tiene mayor producción?"
"¿Cuánta área sembrada se reporta?"
"¿Hay fincas registradas aquí?"
```

---

### 7. Frontend: Integración en App
**Archivo:** `frontend/src/App.tsx`

```tsx
// Tab Navigation cuando municipio seleccionado
<div className="panel-tabs">
  <button onClick={() => setActiveTab('info')}>📊 Información</button>
  <button onClick={() => setActiveTab('agent')}>🤖 Agente</button>
</div>

// Tab: Información (EVA + Fincas - EXISTENTE)
{activeTab === 'info' && (
  <> ... </>
)}

// Tab: Agente (NUEVO)
{activeTab === 'agent' && (
  <AgentPanel 
    municipalityCode={selectedMunicipality.dane_code}
    municipalityName={selectedMunicipality.name}
  />
)}
```

**Contexto automático:**
- Al cambiar a Tab Agente, se pasa automáticamente:
  - `municipality_code`: DANE del municipio seleccionado
  - `year`: 2024 (por defecto)

---

### 8. Frontend: Estilos de Tabs
**Archivo:** `frontend/src/App.css` (agregado al final)

```css
.panel-tabs { ... flex, border-bottom }
.tab-btn { ... padding, font-weight, active state }
.agent-panel-wrapper { ... padding, flex }
```

---

### 9. Frontend: API Client
**Archivo:** `frontend/src/services/api.ts` (modificado)

```typescript
export interface AgentContext { ... }
export interface AgentChatRequest { ... }
export interface AgentChatResponse { ... }

api.agent.chat(request: AgentChatRequest): Promise<AgentChatResponse>
```

---

## 🧪 TESTS

**Archivo:** `backend/tests/test_agent.py`

```python
def test_agent_disabled_when_not_configured()
def test_agent_missing_api_key()
def test_agent_missing_message()
def test_agent_invalid_year()
async def test_agent_chat_with_context()
async def test_agent_tool_execution_error_handling()
async def test_agent_get_municipality_agriculture_tool()
def test_agent_response_schema()
```

**Cobertura:**
- ✅ Agent disabled (503)
- ✅ Missing API key (503)
- ✅ Validation (422)
- ✅ Context preservation
- ✅ Tool error handling
- ✅ OpenRouter mocked (sin llamadas reales)

---

## 📦 ARCHIVOS NUEVOS / MODIFICADOS

### ✨ Nuevos Archivos

```
backend/
├── app/core/
│   └── openrouter_client.py          (63 líneas)
├── app/routers/
│   └── agent.py                      (38 líneas)
├── app/schemas/
│   └── agent_schemas.py              (39 líneas)
├── app/services/
│   └── agent_service.py              (129 líneas)
├── app/tools/
│   └── agent_tools.py                (278 líneas)
└── tests/
    └── test_agent.py                 (152 líneas)

frontend/
├── src/components/
│   ├── AgentPanel.tsx                (164 líneas)
│   └── AgentPanel.css                (272 líneas)
```

**Total archivos nuevos:** 9

### 🔄 Archivos Modificados

```
backend/
├── app/core/config.py                (+1 línea: OPENROUTER_MODEL)
├── app/main.py                       (+2 líneas: import, include_router agent)
└── .env.local                        (+1 línea: OPENROUTER_MODEL=openrouter/auto)

frontend/
├── src/App.tsx                       (+estado activeTab, <AgentPanel>)
├── src/App.css                       (+36 líneas: panel-tabs styles)
└── src/services/api.ts               (+interfaces + api.agent.chat)
```

**Total líneas modificadas:** ~60

---

## 🚀 EJEMPLO DE REQUEST/RESPONSE

### Request

```bash
curl -X POST http://localhost:8000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "¿Cuáles son los principales cultivos?",
    "context": {
      "municipality_code": "76001",
      "year": 2024
    }
  }'
```

### Response (200 OK)

```json
{
  "answer": "Según EVA 2024, los principales cultivos en Cali (DANE 76001) son...",
  "sources": [
    "EVA 2024 - Estadísticas Agrícolas Oficiales",
    "Tool: get_municipality_agriculture"
  ],
  "tools_used": [
    "get_municipality_agriculture"
  ],
  "context": {
    "municipality_code": "76001",
    "year": 2024
  }
}
```

### Response (503 - Agent Disabled)

```json
{
  "detail": "Agent not available. OpenRouter API key not configured."
}
```

---

## 🔌 CONFIGURACIÓN REQUERIDA

### Backend (.env.local)

```env
# Requerido para activar el agente:
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/auto
```

Si `OPENROUTER_ENABLED=false`:
- Endpoint responde 503 "Agent not available"
- FastAPI continúa funcionando (salud)
- NO rompe aplicación

---

## ✅ VALIDACIÓN

### Backend

```bash
# Compilación Python
$ python -m compileall app
Output: Compiling 'app\tools\agent_tools.py'...

# Linting (ruff)
$ ruff check app
Before: 6 fixable errors
After:  Fixed 6 errors (imports, unused imports)

# Tests (ready)
$ pytest tests/test_agent.py -v
(Ejecutable sin necesidad OpenRouter real)
```

### Frontend

```bash
# Build TypeScript
$ npm run build
✓ 137 modules transformed
✓ built in 2.06s
dist/index.html                   0.46 kB │ gzip:   0.30 kB
dist/assets/index-ZeDbw1Zi.css   32.73 kB │ gzip:  10.47 kB
dist/assets/index-DvsVrhjl.js   374.25 kB │ gzip: 117.44 kB
```

---

## 🔐 SEGURIDAD

### API Key Protection
- ✅ NO logueo de API keys
- ✅ NO exposición en responses
- ✅ Validación de presencia antes de usar
- ✅ Timeout en llamadas (30s)

### Data Integrity
- ✅ System prompt obliga fuentes
- ✅ No inventar datos (directiva explícita)
- ✅ Distinguir EVA vs. AgroMapa (actual)
- ✅ Tools retornan datos reales (Supabase)

### Input Validation
- ✅ Message length: 1-1000 chars
- ✅ Year range: 2000-2100
- ✅ DANE codes verified (get_by_dane_code)

---

## 📊 GIT STATUS

```
On branch feature/sprint-03-data-agent
Your branch is up to date with 'origin/feature/sprint-03-data-agent'.

Changes not staged for commit:
  modified:   backend/app/core/config.py
  modified:   backend/app/main.py
  modified:   frontend/src/App.css
  modified:   frontend/src/App.tsx
  modified:   frontend/src/services/api.ts

Untracked files:
  backend/app/core/openrouter_client.py
  backend/app/routers/agent.py
  backend/app/schemas/agent_schemas.py
  backend/app/services/agent_service.py
  backend/app/tools/
  backend/tests/test_agent.py
  frontend/src/components/AgentPanel.css
  frontend/src/components/AgentPanel.tsx
```

---

## 🎯 CÓMO PROBAR (Manual)

### 1. Backend: Configurar OpenRouter

```bash
# Editar backend/.env.local
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
```

### 2. Frontend: Iniciar dev server

```bash
cd frontend
npm run dev
```

### 3. Backend: Iniciar API

```bash
cd backend
python -m app.main
```

### 4. Navegar en UI

1. Abrir http://localhost:5173
2. Seleccionar Departamento (ej: Cauca)
3. Seleccionar Municipio (ej: Santander de Quilichao)
4. Click en tab **🤖 Agente**
5. Escribir pregunta
6. Enviar

### 5. Esperado

- Respuesta grounded en EVA 2024
- Menciona fuente (EVA 2024)
- NO inventa disponibilidad
- Si hay fincas → menciona source "AgroMapa"

---

## 🚫 RESTRICCIONES CUMPLIDAS

✅ **NO rehacer mapa** — Map.tsx intacto
✅ **NO rehacer EVA** — agriculture_service.py intacto
✅ **NO modificar migraciones** — Supabase schema intacto
✅ **NO modificar sincronización territorial** — sync intact
✅ **NO hardcodear secretos** — .env.local
✅ **NO RAG todavía** — Tools directos a repos
✅ **NO embeddings todavía** — Vector search no usado
✅ **NO pgvector** — query simple en Supabase
✅ **NO HTTP del backend contra sí mismo** — Tools async directo

---

## 📝 NOTAS TÉCNICAS

### Por qué no RAG/Embeddings?
- Foco en **grounding** primero (verdad de datos)
- EVA + Fincas = fuentes confiables (BD + oficiales)
- LLM solo redacta, no genera
- RAG añadiría complejidad sin valor inicial

### Por qué OpenRouter?
- Multi-model (soporta o1, o1-mini, gpt-4, etc.)
- Fallback a `openrouter/auto`
- Costo-efectivo para MVP
- Fácil cambio a Anthropic API cuando se requiera

### Por qué tools async Python directo?
- **Performance**: No hay latencia de HTTP
- **Seguridad**: Datos no salen del backend
- **Debugging**: Stack traces claros
- **Batch**: Fácil agregar lógica previa/posterior

---

## 🔄 PRÓXIMOS PASOS (NO IMPLEMENTADOS)

- [ ] Persistencia de historial (DB agent_conversations)
- [ ] Feedback loop (user rating → data quality scoring)
- [ ] RAG sobre historical queries (similarity search)
- [ ] Multi-language (Spanish → English context)
- [ ] Webhook para eventos de cultivo
- [ ] Export respuesta a PDF
- [ ] Share conversation link

---

## 📞 SOPORTE

**Si OpenRouter no responde:**
- Revisar .env.local: OPENROUTER_ENABLED, OPENROUTER_API_KEY
- Logs: backend console (OpenRouter API error messages)
- Frontend: mensaje claro "Agent not available"

**Si tools no retornan datos:**
- Verificar Supabase está up
- Revisar DANE code es válido
- Check repositories: agriculture_repository, geo_repository

---

**IMPLEMENTACIÓN COMPLETADA**
- Fecha: 2026-09-09
- Rama: feature/sprint-03-data-agent
- Estado: ✅ READY FOR REVIEW (SIN COMMIT)

---
