import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPanel } from '../AgentPanel';

// Contrato real: api.agent.chat devuelve { data: { answer, sources, tools_used, context } }.
const h = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { ...actual.api, agent: { chat: h.chat } } };
});

const UNAVAILABLE = 'El asistente no está disponible temporalmente. Puedes seguir explorando el mapa, Mercado y los recursos.';

function renderPanel() {
  return render(<AgentPanel municipalityCode="76890" municipalityName="Yotoco" departmentCode="76" />);
}

async function send(text: string) {
  const input = screen.getByRole('textbox');
  await userEvent.type(input, text);
  await userEvent.click(screen.getByRole('button', { name: '→' }));
}

function httpError(status: number, detail?: string) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: detail ? { detail } : {} } });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom no implementa scrollIntoView, que el panel usa al llegar mensajes.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('estados del agente', () => {
  it('mientras consulta muestra "Consultando datos de Raíces Conectadas..."', async () => {
    h.chat.mockReturnValue(new Promise(() => undefined));
    renderPanel();

    await send('¿Cuánta área sembrada hay?');

    expect(await screen.findByText('Consultando datos de Raíces Conectadas...')).toBeInTheDocument();
  });

  it('502/503: mensaje de no disponible, sin pantalla rota, y el resto de la app sigue ahí', async () => {
    h.chat.mockRejectedValue(httpError(502));
    renderPanel();

    await send('hola');

    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('504 (timeout): mensaje claro y recuperación limpia, sin reintento automático', async () => {
    h.chat.mockRejectedValue(httpError(504));
    renderPanel();

    await send('hola');

    expect(await screen.findByText('El agente tardó demasiado en responder. Intenta nuevamente.')).toBeInTheDocument();
    expect(h.chat).toHaveBeenCalledTimes(1);
  });

  it('reintento manual: volver a enviar tras el error sí consulta de nuevo', async () => {
    h.chat.mockRejectedValueOnce(httpError(504)).mockResolvedValueOnce({
      data: { answer: 'Según EVA 2024, hay 120 ha.', sources: [], tools_used: [], context: {} },
    });
    renderPanel();

    await send('primera');
    await screen.findByText('El agente tardó demasiado en responder. Intenta nuevamente.');
    await send('segunda');

    expect(await screen.findByText('Según EVA 2024, hay 120 ha.')).toBeInTheDocument();
    expect(h.chat).toHaveBeenCalledTimes(2);
  });
});

describe('respuesta con naturaleza de la fuente', () => {
  it('muestra la respuesta y las fuentes con su etiqueta (EVA con año, ofertas como vigentes)', async () => {
    h.chat.mockResolvedValue({
      data: {
        answer: 'Según EVA 2024 se reportan 120 ha. Ofertas actuales: 800 kg a COP $8.000/kg.',
        sources: [
          'EVA 2024 - Estadísticas agrícolas oficiales (histórico, no es disponibilidad actual)',
          'Ofertas vigentes registradas en Raíces Conectadas (disponibilidad actual)',
        ],
        tools_used: ['get_municipality_agriculture', 'get_current_offers'],
        context: {},
      },
    });
    renderPanel();

    await send('resumen');

    expect(await screen.findByText(/COP \$8\.000\/kg/)).toBeInTheDocument();
    expect(screen.getByText(/EVA 2024 - Estadísticas agrícolas oficiales/)).toBeInTheDocument();
    expect(screen.getByText(/Ofertas vigentes registradas/)).toBeInTheDocument();
  });

  it('sin resultados en el marketplace la respuesta llega tal cual, sin inventar disponibilidad', async () => {
    h.chat.mockResolvedValue({
      data: {
        answer: 'No encuentro ofertas activas de plátano en Yotoco en este momento.',
        sources: ['EVA 2024 - Estadísticas agrícolas oficiales (histórico, no es disponibilidad actual)'],
        tools_used: ['get_current_offers'],
        context: {},
      },
    });
    renderPanel();

    await send('¿hay plátano?');

    await waitFor(() => expect(screen.getByText('No encuentro ofertas activas de plátano en Yotoco en este momento.')).toBeInTheDocument());
  });
});
