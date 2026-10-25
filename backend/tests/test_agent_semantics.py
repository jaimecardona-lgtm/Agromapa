"""Semántica del agente: cada fuente se usa para lo que es, y nunca se presenta como otra.

El modelo se simula con respuestas guionadas (sin OpenRouter, sin red, sin costo). Las herramientas
usan dobles de servicio. Lo que se verifica es: qué herramienta se ejecuta, qué recibe el modelo y
qué fuentes se devuelven al usuario.
"""

import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.agent_schemas import AgentChatRequest, AgentContext
from app.services import agent_service
from app.services.agent_sources import TOOL_CATEGORY, SourceCategory, source_labels
from app.tools import agent_tools

PUERTO_CARREÑO = "99773"
YOTOCO = "76890"
PRODUCER_ID = "ecc689f2-777d-4844-9a91-229af7fbedf3"
PRIVATE_PHONE = "3001112233"
PRIVATE_EMAIL = "jaime-privado@example.com"
PRIVATE_USER = "732b89e0-4d24-4148-af5e-df2614a4e197"


def tool_round(*calls):
    return {
        "choices": [
            {
                "message": {
                    "content": None,
                    "tool_calls": [
                        {"id": f"call-{i}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}
                        for i, (name, args) in enumerate(calls)
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "_model_used": "test-model",
    }


def final(text):
    return {"choices": [{"message": {"content": text, "tool_calls": None}, "finish_reason": "stop"}], "_model_used": "test-model"}


def scripted_llm(monkeypatch, *responses):
    """Respuestas del modelo en orden. Devuelve la lista de mensajes que recibió en cada llamada."""
    queue = list(responses)
    received: list[list[dict]] = []

    async def chat_completion(messages, tools=None, tool_choice=None, temperature=None, top_p=None, max_tokens=None, **_):
        received.append([dict(m) for m in messages])
        return queue.pop(0) if queue else final("")

    monkeypatch.setattr(agent_service.openrouter_client, "is_configured", lambda: True)
    monkeypatch.setattr(agent_service.openrouter_client, "chat_completion", chat_completion)
    return received


def tool_results(received):
    """Contenido JSON de los mensajes 'tool' que vio el modelo en la última llamada."""
    last = received[-1]
    return [json.loads(m["content"]) for m in last if m.get("role") == "tool"]


async def ask(message, municipality=None):
    context = AgentContext(municipality_code=municipality)
    return await agent_service.chat_with_agent(AgentChatRequest(message=message, context=context))


class _Geo:
    def __init__(self, known):
        self.known = known

    async def get_by_dane_code(self, level, code):
        return self.known.get((level, code))


@pytest.fixture
def services(monkeypatch):
    """Dobles de servicio. Cada test ajusta solo lo que necesita."""
    monkeypatch.setattr(agent_tools, "geo_repo", _Geo({("municipality", YOTOCO): {"id": "m1", "name": "Yotoco", "dane_code": YOTOCO}}))

    async def eva(municipality_code, year=2024):
        return {"year": year, "municipality_code": municipality_code, "crops": [{"crop_name": "Café", "planted_ha": 120}]}

    async def farms(municipality_code):
        return [{"id": "f1", "name": "villa carolina", "producer_name": "Jaime Cardona Finca", "crops": [{"name": "Café", "area_hectares": 1}]}]

    async def profile(producer_id):
        return SimpleNamespace(model_dump=lambda mode="json": {"id": str(producer_id), "name": "Jaime Cardona Finca", "farms": [], "active_offers": []})

    monkeypatch.setattr(agent_tools, "get_municipality_agriculture", eva)
    monkeypatch.setattr(agent_tools, "get_municipality_farms", farms)
    monkeypatch.setattr(agent_tools, "get_public_producer_profile", profile)

    state = {"offers": []}

    async def current_offers(municipality_code=None, crop_name=None, **_):
        items = list(state["offers"])
        if crop_name:
            items = [o for o in items if crop_name.lower() in o["crop_name"].lower()]
        if municipality_code:
            items = [o for o in items if o.get("municipality_code") == municipality_code]
        return SimpleNamespace(count=len(items), data=items, model_dump=lambda: {"count": len(items), "data": items})

    from app.services import operational_service

    monkeypatch.setattr(operational_service, "get_current_offers", current_offers)
    return state


def _offer(**overrides):
    base = {
        "id": "o1",
        "crop_name": "Café",
        "farm_id": "f1",
        "farm_name": "villa carolina",
        "municipality_code": YOTOCO,
        "municipality_name": "Yotoco",
        "producer_id": PRODUCER_ID,
        "producer_name": "Jaime Cardona Finca",
        "producer_contact": {"public_phone": PRIVATE_PHONE, "public_email": PRIVATE_EMAIL, "whatsapp": None},
        "producer_user_id": PRIVATE_USER,
        "quantity": 800,
        "unit": "kg",
        "price_per_unit": 8000,
        "available_from": None,
        "available_until": None,
        "status": "available",
    }
    base.update(overrides)
    return base


# ---------- taxonomía ----------


def test_every_tool_belongs_to_exactly_one_category():
    schema_names = {tool["function"]["name"] for tool in agent_tools.AGENT_TOOLS_SCHEMA}
    assert schema_names <= set(TOOL_CATEGORY)
    assert TOOL_CATEGORY["get_current_offers"] is SourceCategory.MARKETPLACE_OFFERS
    assert TOOL_CATEGORY["get_municipality_agriculture"] is SourceCategory.EVA_HISTORICAL
    assert TOOL_CATEGORY["search_crop"] is SourceCategory.EVA_HISTORICAL


def test_eva_label_names_its_year_and_states_it_is_historical():
    label = source_labels({SourceCategory.EVA_HISTORICAL}, {2024})[0]
    assert label.startswith("EVA 2024")
    assert "histórico" in label
    assert "disponibilidad actual" not in label.split("(")[0]


# ---------- CASO 1 y 6: EVA histórica ----------


async def test_caso1_planted_area_uses_eva_and_names_the_year(monkeypatch, services):
    received = scripted_llm(
        monkeypatch,
        tool_round(("get_municipality_agriculture", {"municipality_code": PUERTO_CARREÑO, "year": 2024})),
        final("Según EVA 2024, en Puerto Carreño se reportan 120 ha sembradas de café."),
    )
    response = await ask("¿Cuánta área sembrada se reporta en Puerto Carreño?", PUERTO_CARREÑO)

    assert "EVA 2024" in response.answer
    assert any(s.startswith("EVA 2024") for s in response.sources)
    assert response.tools_used == ["get_municipality_agriculture"]
    assert tool_results(received)[0]["source_category"] == "eva_historical"


async def test_caso6_production_question_uses_eva_not_offers(monkeypatch, services):
    scripted_llm(
        monkeypatch,
        tool_round(("get_municipality_agriculture", {"municipality_code": YOTOCO})),
        final("Según EVA 2024, Yotoco reporta producción histórica de café."),
    )
    response = await ask("Producción de café en Yotoco", YOTOCO)

    assert any(s.startswith("EVA 2024") for s in response.sources)
    assert not any("Ofertas" in s for s in response.sources)


# ---------- CASO 2 y 3: disponibilidad actual ----------


async def test_caso2_availability_queries_offers_and_never_eva(monkeypatch, services):
    received = scripted_llm(
        monkeypatch,
        tool_round(("get_current_offers", {"crop_name": "plátano", "municipality_code": PUERTO_CARREÑO})),
        final("No encuentro ofertas activas de plátano en Puerto Carreño en este momento."),
    )
    response = await ask("¿Hay plátano disponible actualmente en Puerto Carreño?", PUERTO_CARREÑO)

    result = tool_results(received)[0]
    assert result["source_category"] == "marketplace_offers"
    assert result["no_results"] is True
    assert "No encuentro ofertas activas" in response.answer
    assert not any(s.startswith("EVA") for s in response.sources)
    assert any("Ofertas vigentes" in s for s in response.sources)


async def test_caso3_empty_marketplace_with_eva_data_never_claims_availability(monkeypatch, services):
    received = scripted_llm(
        monkeypatch,
        tool_round(
            ("get_municipality_agriculture", {"municipality_code": YOTOCO}),
            ("get_current_offers", {"crop_name": "plátano", "municipality_code": YOTOCO}),
        ),
        final("No encuentro ofertas activas de plátano en Yotoco en este momento. EVA 2024 reporta producción histórica, que no es inventario disponible."),
    )
    response = await ask("¿Hay plátano disponible en Yotoco?", YOTOCO)

    results = {r["source_category"]: r for r in tool_results(received)}
    assert results["marketplace_offers"]["no_results"] is True
    assert any(s.startswith("EVA 2024") for s in response.sources)
    assert any("Ofertas vigentes" in s for s in response.sources)
    # La regla que impide afirmar disponibilidad desde EVA está en el prompt del sistema.
    system = received[0][0]["content"]
    assert "Nunca uses EVA como evidencia de disponibilidad actual" in system
    assert "No digas que el producto no existe" in system


# ---------- CASO 4 y 8: quién vende y precio en COP ----------


async def test_caso4_who_sells_coffee_uses_marketplace_and_hides_contact(monkeypatch, services):
    services.update(offers=[_offer()])
    received = scripted_llm(
        monkeypatch,
        tool_round(("get_current_offers", {"crop_name": "café", "municipality_code": YOTOCO})),
        final("Jaime Cardona Finca ofrece 800 kg de café a COP $8.000/kg."),
    )
    response = await ask("¿Quién vende café en Yotoco?", YOTOCO)

    seen = json.dumps(tool_results(received), ensure_ascii=False)
    assert PRIVATE_PHONE not in seen
    assert PRIVATE_EMAIL not in seen
    assert PRIVATE_USER not in seen
    assert "producer_contact" not in seen
    assert any("Ofertas vigentes" in s for s in response.sources)


async def test_caso8_offer_price_reaches_the_model_in_cop_with_unit(monkeypatch, services):
    services.update(offers=[_offer()])
    received = scripted_llm(
        monkeypatch,
        tool_round(("get_current_offers", {"crop_name": "café", "municipality_code": YOTOCO})),
        final("800 kg a COP $8.000/kg."),
    )
    await ask("¿Qué precio tiene el café en Yotoco?", YOTOCO)

    item = tool_results(received)[0]["data"]["data"][0]
    assert item["price_label"] == "COP $8.000/kg"
    assert item["quantity"] == 800 and item["unit"] == "kg"


# ---------- CASO 5: finca operacional ----------


async def test_caso5_registered_farm_crops_come_from_farms_source(monkeypatch, services):
    scripted_llm(
        monkeypatch,
        tool_round(("get_municipality_farms", {"municipality_code": YOTOCO})),
        final("La finca villa carolina tiene café registrado (1 ha)."),
    )
    response = await ask("¿Qué cultivos tiene Villa Carolina?", YOTOCO)

    assert "Fincas registradas en Raíces Conectadas" in response.sources
    assert not any(s.startswith("EVA") for s in response.sources)


# ---------- CASO 7: territorio inexistente ----------


async def test_caso7_unknown_territory_is_reported_not_invented(monkeypatch, services):
    received = scripted_llm(
        monkeypatch,
        tool_round(("get_municipality", {"municipality_code": "99999"})),
        final("No encontré ese municipio en el catálogo territorial."),
    )
    response = await ask("Cuéntame del municipio 99999", None)

    result = tool_results(received)[0]
    assert result["success"] is False
    assert "data" not in result
    assert "no encontr" in response.answer.lower()


# ---------- CASO 9: productor sin contacto ----------


async def test_caso9_producer_profile_tool_never_returns_private_fields(monkeypatch, services):
    received = scripted_llm(
        monkeypatch,
        tool_round(("get_producer_profile", {"producer_id": PRODUCER_ID})),
        final("Jaime Cardona Finca es un productor público de Raíces Conectadas."),
    )
    response = await ask("¿Qué ofrece Jaime Cardona?")

    seen = json.dumps(tool_results(received), ensure_ascii=False)
    for forbidden in ("producer_contact", "email", "phone", "user_id", PRIVATE_EMAIL, PRIVATE_PHONE):
        assert forbidden not in seen
    assert any("Perfiles públicos" in s for s in response.sources)


def test_producer_profile_tool_rejects_malformed_id():
    import asyncio

    result = asyncio.run(agent_tools.execute_tool("get_producer_profile", {"producer_id": "no-es-uuid"}))
    assert result["success"] is False


# ---------- límites y fallos ----------


async def test_tool_rounds_are_capped_and_never_loop_forever(monkeypatch, services):
    endless = [tool_round(("get_municipality", {"municipality_code": YOTOCO})) for _ in range(10)]
    received = scripted_llm(monkeypatch, *endless)

    response = await ask("bucle", YOTOCO)

    assert len(received) == agent_service.MAX_TOOL_ROUNDS
    assert response.answer == "No response generated"


async def test_offer_lookup_failure_is_reported_as_unavailable_not_empty(monkeypatch, services):
    from app.services import operational_service

    async def broken(**_):
        raise RuntimeError("db down")

    monkeypatch.setattr(operational_service, "get_current_offers", broken)
    received = scripted_llm(
        monkeypatch,
        tool_round(("get_current_offers", {"crop_name": "café"})),
        final("No pude consultar las ofertas en este momento."),
    )
    await ask("¿Hay café?", None)

    result = tool_results(received)[0]
    assert result["success"] is False
    assert result["error_kind"] == "unavailable"
    assert "No pudimos consultar" in result["error"]


def test_tool_schema_exposes_the_producer_tool():
    names = {tool["function"]["name"] for tool in agent_tools.AGENT_TOOLS_SCHEMA}
    assert "get_producer_profile" in names


# ---------- degradación: OpenRouter ----------


@pytest.fixture
def agent_enabled(monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_ENABLED", True)
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "clave-de-prueba-sin-red")
    monkeypatch.setattr(agent_service.openrouter_client, "is_configured", lambda: True)


def test_caso10_openrouter_timeout_is_controlled_504_without_retry(monkeypatch, agent_enabled):
    calls = []

    async def timeout(*args, **kwargs):
        calls.append(1)
        raise httpx.TimeoutException("lento")

    monkeypatch.setattr(agent_service.openrouter_client, "chat_completion", timeout)
    client = TestClient(app)

    response = client.post("/api/agent/chat", json={"message": "hola", "context": {}})

    assert response.status_code == 504
    assert "tardó demasiado" in response.json()["detail"]
    assert len(calls) == 1


def test_openrouter_unavailable_is_502_with_a_clear_message(monkeypatch, agent_enabled):
    async def unavailable(*args, **kwargs):
        request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
        raise httpx.HTTPStatusError("503", request=request, response=httpx.Response(503, request=request, text="down"))

    monkeypatch.setattr(agent_service.openrouter_client, "chat_completion", unavailable)
    client = TestClient(app)

    response = client.post("/api/agent/chat", json={"message": "hola", "context": {}})

    assert response.status_code == 502
    assert "explorando el mapa, Mercado y los recursos" in response.json()["detail"]


def test_agent_is_503_when_disabled_without_calling_the_model(monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_ENABLED", False)
    response = TestClient(app).post("/api/agent/chat", json={"message": "hola", "context": {}})
    assert response.status_code == 503
