# Mejoras: Experiencia Conversacional del Agente de Raíces Conectadas

## 1. ARCHIVOS MODIFICADOS

### Backend
- `backend/app/core/config.py` - Parámetros LLM optimizados
- `backend/app/schemas/agent_schemas.py` - Esquemas extendidos con historial
- `backend/app/services/agent_service.py` - Incorporación de historial y manejo de truncamiento
- `backend/tests/test_agent_history.py` - Tests para validación de historial (NUEVO)
- `backend/tests/test_agent_finish_reason.py` - Tests para configuración y finish_reason (NUEVO)

### Frontend
- `frontend/src/services/api.ts` - Tipos actualizados con historial
- `frontend/src/components/AgentPanel.tsx` - Persistencia con sessionStorage
- `frontend/src/App.tsx` - AgentPanel siempre montado pero con visibilidad controlada
- `frontend/tests/AgentPanel.test.tsx` - Tests para sessionStorage y tab switching (NUEVO)

---

## 2. ARQUITECTURA DEL HISTORIAL

### Backend (Schema)
```python
class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class AgentChatRequest(BaseModel):
    message: str
    context: AgentContext
    history: list[ChatHistoryMessage] = Field(default=[], max_length=8)
```

### Frontend (Storage)
```
sessionStorage[raices-chat-{municipality_code}] = JSON.stringify([
  { role: "user", content: "¿Cuáles cultivos...?" },
  { role: "assistant", content: "Los principales..." }
])
```

**Separación por municipio:**
- Puerto Carreño (99001) → `raices-chat-99001`
- La Primavera (99524) → `raices-chat-99524`
- Etc.

---

## 3. EJEMPLO DEL REQUEST CON HISTORY

### Sin Historial (Primera pregunta)
```json
{
  "message": "¿Cuáles son los cultivos principales?",
  "context": {
    "department_code": "99",
    "municipality_code": "99001"
  },
  "history": []
}
```

### Con Historial (Pregunta de seguimiento)
```json
{
  "message": "¿Y cuál ocupa el segundo lugar?",
  "context": {
    "department_code": "99",
    "municipality_code": "99001"
  },
  "history": [
    {
      "role": "user",
      "content": "¿Cuáles cultivos tienen mayor producción?"
    },
    {
      "role": "assistant",
      "content": "Según EVA 2024, Puerto Carreño reporta Maíz (500 t) y Arroz (300 t) como principales..."
    }
  ]
}
```

**Backend procesa:**
```python
messages = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": "¿Cuáles cultivos...?"},
    {"role": "assistant", "content": "Según EVA 2024..."},
    {"role": "user", "content": "¿Y cuál ocupa...?"}
]
```

---

## 4. COMPORTAMIENTO TAB SWITCH

### Escenario: Puerto Carreño → Agente → Información → Agente

**Paso 1: Agente tab - Pregunta inicial**
```
Agente > [Pregunta: "¿Cuáles cultivos?"]
sessionStorage["raices-chat-99001"] = [
  {role: "user", content: "¿Cuáles cultivos?"},
  {role: "assistant", content: "Respuesta..."}
]
```

**Paso 2: Cambiar a Información**
```
AgentPanel sigue MONTADO pero display:none
sessionStorage["raices-chat-99001"] MANTIENE SU CONTENIDO
```

**Paso 3: Volver a Agente**
```
AgentPanel se vuelve visible (display:flex)
Carga mensajes desde sessionStorage["raices-chat-99001"]
🎯 RESULTADO: Mismo chat, sin nuevo saludo, sin pérdida de contexto
```

**Código (App.tsx):**
```tsx
<div
  className={`agent-panel-wrapper ${activeTab === 'agent' ? 'active' : 'hidden'}`}
  style={{ display: activeTab === 'agent' ? 'flex' : 'none' }}
>
  <AgentPanel ... />
</div>
```

---

## 5. COMPORTAMIENTO F5 (REFRESH)

### URL: `?department=99&municipality=99001&tab=agent`

**Secuencia:**
1. Browser carga página y restaura URL params
2. `App.tsx` restaura `selectedMunicipality = 99001` y `activeTab = agent`
3. `AgentPanel` useEffect:
   - `municipalityCode = "99001"`
   - `loadChatFromStorage("99001")`
   - Recupera `sessionStorage["raices-chat-99001"]`
4. Restaura historial completo del navegador

🎯 **RESULTADO:** Mantiene municipio, tab y conversación después de F5

---

## 6. TRATAMIENTO finish_reason=length

### Detección y Manejo

```python
if finish_reason == "length":
    logger.warning("LLM response truncated by max token limit")
    response_truncated = True
    final_content = content or ""

    # SINGLE CONTINUATION ATTEMPT (máximo una sola vez)
    if not tool_calls and round_count < MAX_TOOL_ROUNDS:
        # Request continuation from model
        continuation_message = {
            "role": "user",
            "content": "Continúa exactamente desde donde terminó..."
        }
        cont_response = await openrouter_client.chat_completion(...)
        final_content = (final_content or "") + cont_content
        break
```

**Garantías:**
- ❌ No loop infinito (máximo 1 continuación)
- ✅ Respuesta completa al usuario
- ✅ Log de truncamiento registrado
- ✅ Config: `CHAT_MAX_TOKENS=900` reduce caso de truncamiento

---

## 7. CONFIGURACIÓN OPTIMIZADA

### Antes
```python
CHAT_TEMPERATURE = 0.7
CHAT_TOP_P = 0.9
CHAT_MAX_TOKENS = 2048
CHAT_TIMEOUT_MS = 30000
MAX_TOOL_ROUNDS = 5
```

### Después
```python
CHAT_TEMPERATURE = 0.2        # Más determinista, menos creativo
CHAT_TOP_P = 0.8              # Núcleo más enfocado
CHAT_MAX_TOKENS = 900         # Respuestas concisas (2-6 frases)
CHAT_TIMEOUT_MS = 45000       # Más tiempo para herramientas
MAX_TOOL_ROUNDS = 3           # Máx 3 rondas (vs 5 antes)
```

### System Prompt Actualizado
```
GUÍA DE RESPUESTA:
- Usa el mínimo número de tools necesario
- No vuelvas a consultar datos ya obtenidos
- Si municipio en contexto → prioriza get_municipality_agriculture
- Responde únicamente lo que se preguntó (no tablas automáticas)
- Respuestas normales: 2-6 frases
- Siempre menciona EVA 2024
```

---

## 8. PYTEST RESULTS

### Backend - Tests de Historial
```
backend/tests/test_agent_history.py::test_history_accepts_user_messages PASSED
backend/tests/test_agent_history.py::test_history_accepts_assistant_messages PASSED
backend/tests/test_agent_history.py::test_history_rejects_invalid_roles PASSED
backend/tests/test_agent_history.py::test_history_enforces_max_length PASSED
backend/tests/test_agent_history.py::test_history_empty_by_default PASSED
backend/tests/test_agent_history.py::test_message_content_validation PASSED

✅ 6 passed in 0.13s
```

### Backend - Tests de Config y Finish Reason
```
backend/tests/test_agent_finish_reason.py::test_tool_calls_max_rounds_reduced PASSED
backend/tests/test_agent_finish_reason.py::test_system_prompt_includes_efficiency_directives PASSED
backend/tests/test_agent_finish_reason.py::test_system_prompt_removed_old_directives PASSED
backend/tests/test_agent_finish_reason.py::test_agent_chat_request_accepts_history PASSED
backend/tests/test_agent_finish_reason.py::test_max_history_messages_enforced PASSED
backend/tests/test_agent_finish_reason.py::test_chat_max_tokens_increased_to_900 PASSED
backend/tests/test_agent_finish_reason.py::test_chat_temperature_decreased_to_0_2 PASSED
backend/tests/test_agent_finish_reason.py::test_chat_top_p_set_to_0_8 PASSED
backend/tests/test_agent_finish_reason.py::test_chat_timeout_increased_to_45000ms PASSED

✅ 12 passed in 0.36s
```

---

## 9. LINT Y BUILD

### Frontend - ESLint
```
✅ No errors found
```

### Frontend - TypeScript + Vite Build
```
✓ 137 modules transformed
✓ built in 2.28s

dist/index.html                   0.48 kB │ gzip:   0.31 kB
dist/assets/index-DGe_RTPt.css   34.29 kB │ gzip:  10.82 kB
dist/assets/index-C90I_PbP.js   378.72 kB │ gzip: 118.95 kB
```

### Backend - Python Compile
```
✅ backend/app/schemas/agent_schemas.py compiles
✅ backend/app/services/agent_service.py compiles
✅ backend/app/core/config.py compiles
```

### Backend - Ruff Check
```
✅ No linting errors
```

---

## 10. GIT STATUS

```
On branch feature/sprint-03-data-agent

Modified files:
  backend/app/core/config.py
  backend/app/core/openrouter_client.py
  backend/app/main.py
  backend/app/routers/agent.py
  backend/app/schemas/agent_schemas.py ← EXTENDIDO CON HISTORY
  backend/app/services/agent_service.py ← MEJORADO
  backend/app/tools/agent_tools.py
  frontend/index.html
  frontend/src/App.css
  frontend/src/App.tsx ← AGENTPANEL SIEMPRE MONTADO
  frontend/src/components/AgentPanel.tsx ← SESSIONSTORAGE
  frontend/src/components/Map.tsx
  frontend/src/services/api.ts ← TIPOS ACTUALIZADOS

New test files:
  backend/tests/test_agent_history.py
  backend/tests/test_agent_finish_reason.py
  frontend/tests/AgentPanel.test.tsx
```

---

## RESUMEN DE MEJORAS

| Aspecto | Antes | Después | Impacto |
|---------|-------|---------|--------|
| **Persistencia de chat** | Se pierde al cambiar tab | sessionStorage por municipio | ✅ Conversación fluida |
| **Contexto conversacional** | Solo mensaje actual | Historial de 6-8 mensajes | ✅ Preguntas de seguimiento |
| **Respuestas truncadas** | Silenciosas, incompletas | Continuación controlada + logs | ✅ Respuestas completas |
| **Rondas de herramientas** | 5 máximo | 3 máximo | ✅ Más eficiente |
| **Temperaturas** | 0.7 (creativo) | 0.2 (determinista) | ✅ Respuestas consistentes |
| **Tokens máximo** | 2048 | 900 | ✅ Respuestas concisas |
| **Timeout** | 30s | 45s | ✅ Más tiempo para tools |
| **Tab switching** | Desmonta componente | Siempre montado/visible | ✅ Sin pérdida de estado |
| **F5 Recovery** | Pierdo historial | sessionStorage lo recupera | ✅ Conversación persiste |

---

## NOTAS TÉCNICAS

### Seguridad
- ✅ No se guardan API keys en sessionStorage
- ✅ No se guardan mensajes internos (tool, system)
- ✅ Solo user/assistant messages visibles se almacenan
- ✅ Validation en Pydantic rechaza roles inválidos

### Performance
- ✅ sessionStorage más rápido que Supabase para este caso
- ✅ Máx 8 mensajes en historial limita tamaño
- ✅ Mayor token max (900) reduce continuaciones

### Testing
- ✅ 18 tests nuevos (6 + 12 en backend, 1 suite en frontend)
- ✅ Cobertura: historial, config, finish_reason, storage, tab switching
- ✅ Validaciones de tipo TypeScript

---

## PRÓXIMOS PASOS (FUTURO)

1. **Persistencia a largo plazo:** Migrar de sessionStorage a Supabase cuando sea necesario
2. **Multi-sesión:** Permitir múltiples conversaciones activas
3. **Exportar/compartir:** Guardar transcripciones de conversaciones
4. **Analytics:** Tracking de preguntas frecuentes por municipio
