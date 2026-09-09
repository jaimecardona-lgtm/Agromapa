"""Master agent service for AgroMapa with primary/fallback LLM support."""

import json
import logging

from app.core.config import settings
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

MAX_TOOL_ROUNDS = 5


async def chat_with_agent(request: AgentChatRequest) -> AgentChatResponse:
    """Process a chat message using the master agent with tool-loop support."""

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
    model_used = None
    round_count = 0

    try:
        # Multi-round tool loop (max 5 rounds)
        for round_num in range(MAX_TOOL_ROUNDS):
            round_count = round_num + 1
            logger.info(f"Agent round {round_count}/{MAX_TOOL_ROUNDS}")

            # Call LLM
            response = await openrouter_client.chat_completion(
                messages=messages,
                tools=AGENT_TOOLS_SCHEMA,
                tool_choice="auto",
                temperature=settings.CHAT_TEMPERATURE,
                top_p=settings.CHAT_TOP_P,
                max_tokens=settings.CHAT_MAX_TOKENS,
            )

            model_used = response.pop("_model_used", model_used)

            # Extract message
            assistant_message = response.get("choices", [{}])[0].get("message", {})
            finish_reason = response.get("choices", [{}])[0].get("finish_reason", "stop")
            content = assistant_message.get("content")
            tool_calls = assistant_message.get("tool_calls") or []

            logger.info(
                f"Round {round_count}: finish_reason={finish_reason}, "
                f"content_len={len(content or '')}, tool_calls={len(tool_calls)}"
            )

            # If no tool calls, we have a final response
            if not tool_calls or finish_reason == "stop":
                logger.info(f"Agent response ready at round {round_count}")
                break

            # Process tool calls
            logger.info(f"Processing {len(tool_calls)} tool calls")

            # Add assistant message first
            messages.append(assistant_message)

            # Execute each tool call
            for tool_call in tool_calls:
                tool_name = tool_call.get("function", {}).get("name")
                raw_args = tool_call.get("function", {}).get("arguments") or "{}"

                # Normalize arguments
                if isinstance(raw_args, str):
                    try:
                        arguments = json.loads(raw_args)
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse tool arguments: {raw_args}. Error: {e}")
                        arguments = {}
                else:
                    arguments = raw_args

                logger.info(f"Executing tool: {tool_name} with args: {arguments}")

                # Execute tool
                tool_result = await execute_tool(tool_name, arguments)
                tools_used.append(tool_name)

                if tool_result.get("success"):
                    sources.add(f"Tool: {tool_name}")
                    logger.info(f"Tool {tool_name} succeeded")
                else:
                    logger.warning(f"Tool {tool_name} failed: {tool_result.get('error')}")

                # Add tool result to messages
                tool_message = {
                    "role": "tool",
                    "tool_call_id": tool_call.get("id", f"tool_{tool_name}"),
                    "content": json.dumps(tool_result, ensure_ascii=False, default=str),
                }
                messages.append(tool_message)
                logger.info(f"Added tool result message for {tool_name}")

        # End of loop - prepare response
        logger.info(f"Agent completed after {round_count} rounds")

        # If we still have no content after loop, check for final assistant message
        if not content:
            # Look for the last assistant message
            for msg in reversed(messages):
                if msg.get("role") == "assistant" and msg.get("content"):
                    content = msg.get("content")
                    break

        if not content:
            logger.warning("No content generated by agent")
            content = "No response generated"

        # Add EVA source if we used agriculture tools
        if any("agriculture" in tool for tool in tools_used):
            sources.add("EVA 2024 - Estadísticas Agrícolas Oficiales")

        # Add AgroMapa source if we used farms tools
        if any("farms" in tool for tool in tools_used):
            sources.add("AgroMapa - Registro Actual de Fincas")

        response_obj = AgentChatResponse(
            answer=content,
            sources=sorted(list(sources)),
            tools_used=tools_used,
            context=request.context,
        )

        logger.info(
            f"Agent response ready. Model: {model_used}, Rounds: {round_count}, "
            f"Tools: {tools_used}, Sources: {len(sources)}"
        )
        return response_obj

    except RuntimeError as e:
        logger.error(f"Agent error: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected agent error: {str(e)}", exc_info=True)
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
