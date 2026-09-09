"""Master agent service for AgroMapa."""

import json
import logging

from app.core.openrouter_client import openrouter_client
from app.schemas.agent_schemas import AgentChatRequest, AgentChatResponse, AgentContext
from app.tools.agent_tools import AGENT_TOOLS_SCHEMA, execute_tool

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres el Asistente Inteligente de AgroMapa Colombia, experto en datos agrícolas territoriales.

DIRECTRICES FUNDAMENTALES:
- No inventes datos. Si no tienes información, dilo claramente.
- EVA es la estadística oficial histórica de producción agrícola en Colombia (año base para referencias).
- Cuando cites datos de EVA, siempre indica el año: "Según EVA 2024..."
- Las fincas registradas en AgroMapa representan información actual registrada por usuarios.
- No confundas EVA (producción histórica) con disponibilidad/stock actual.
- Si AgroMapa no tiene el dato solicitado, comunícalo al usuario.
- Siempre menciona la fuente cuando uses información agrícola.

FUENTES DE DATOS:
- EVA 2024: Estadísticas agrícolas oficiales de producción, área sembrada, área cosechada y rendimiento.
- Fincas AgroMapa: Registro actual de propiedades agrícolas en la plataforma.

Tu rol es ayudar a usuarios a entender la realidad agrícola territorial usando herramientas disponibles.
Sé conciso, preciso y siempre grounded en datos reales.
"""


async def chat_with_agent(request: AgentChatRequest) -> AgentChatResponse:
    """Process a chat message using the master agent."""

    if not openrouter_client.is_configured():
        raise RuntimeError("Agent not configured. Set OPENROUTER_API_KEY and OPENROUTER_ENABLED=true")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": _build_user_message(request.message, request.context),
        },
    ]

    tools_used = []
    sources = set()

    try:
        # First call to LLM with tools
        response = await openrouter_client.chat_completion(
            messages=messages,
            tools=AGENT_TOOLS_SCHEMA,
            tool_choice="auto",
            temperature=0.3,
        )

        finish_reason = response.get("choices", [{}])[0].get("finish_reason", "stop")
        content = response.get("choices", [{}])[0].get("message", {}).get("content")
        tool_calls = response.get("choices", [{}])[0].get("message", {}).get("tool_calls", [])

        # Process tool calls if any
        if tool_calls and finish_reason == "tool_calls":
            for tool_call in tool_calls:
                tool_name = tool_call.get("function", {}).get("name")
                arguments = json.loads(tool_call.get("function", {}).get("arguments", "{}"))

                logger.info(f"Executing tool: {tool_name} with args: {arguments}")

                tool_result = await execute_tool(tool_name, arguments)
                tools_used.append(tool_name)

                if tool_result.get("success"):
                    sources.add(f"Tool: {tool_name}")

                # Add tool result to messages
                messages.append({"role": "assistant", "content": content or ""})
                messages.append({
                    "role": "tool",
                    "tool_use_id": tool_call.get("id"),
                    "content": json.dumps(tool_result),
                })

            # Second call to LLM with tool results
            response = await openrouter_client.chat_completion(
                messages=messages,
                temperature=0.3,
            )

            content = response.get("choices", [{}])[0].get("message", {}).get("content")

        # Add EVA source if we accessed agriculture data
        if "agriculture" in " ".join(tools_used).lower():
            sources.add("EVA 2024 - Estadísticas Agrícolas Oficiales")

        # Add AgroMapa source if we accessed farms
        if "farms" in " ".join(tools_used).lower():
            sources.add("AgroMapa - Registro Actual de Fincas")

        return AgentChatResponse(
            answer=content or "No response generated",
            sources=sorted(list(sources)),
            tools_used=tools_used,
            context=request.context,
        )

    except RuntimeError as e:
        logger.error(f"Agent error: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected agent error: {str(e)}")
        raise RuntimeError(f"Agent error: {str(e)}")


def _build_user_message(message: str, context: AgentContext) -> str:
    """Build user message with context."""

    parts = [message]

    if context.municipality_code:
        parts.append(f"\n[Municipio seleccionado: {context.municipality_code}]")

    if context.department_code and not context.municipality_code:
        parts.append(f"\n[Departamento seleccionado: {context.department_code}]")

    if context.year != 2024:
        parts.append(f"\n[Año: {context.year}]")

    return "".join(parts)
