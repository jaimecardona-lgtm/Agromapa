import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import type { ConversationMessage, ConversationSummary } from '@/services/conversations';
import { MessagesPage } from '../MessagesPage';

const h = vi.hoisted(() => ({
  conversations: {
    list: vi.fn(),
    get: vi.fn(),
    messages: vi.fn(),
    send: vi.fn(),
    markRead: vi.fn(),
    setStatus: vi.fn(),
  },
}));

vi.mock('@/services/conversations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/conversations')>();
  return { ...actual, conversationsApi: h.conversations };
});

function summary(overrides: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: 'conv-1',
    offer_id: 'offer-1',
    farm_id: 'farm-1',
    status: 'active',
    my_role: 'buyer',
    counterpart_name: 'Ana Pérez',
    offer: { crop_name: 'Café', farm_name: 'La Esperanza', municipality_name: 'Dagua', quantity: 120, unit: 'kg', status: 'available' },
    last_message_body: 'Sí, tenemos disponible',
    last_message_at: '2026-10-22T14:00:00Z',
    last_message_is_mine: false,
    unread_count: 2,
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-22T14:00:00Z',
    ...overrides,
  };
}

const MINE: ConversationMessage = {
  id: 'm-0',
  conversation_id: 'conv-1',
  body: '¿Sigue disponible?',
  sender_is_me: true,
  created_at: '2026-10-22T13:00:00Z',
  read_at: null,
};

const THEIRS: ConversationMessage = {
  id: 'm-1',
  conversation_id: 'conv-1',
  body: 'Sí, tenemos disponible',
  sender_is_me: false,
  created_at: '2026-10-22T14:00:00Z',
  read_at: null,
};

function renderMessages(auth: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'compra@example.com' },
    roles: ['buyer'],
    setRoleActive: vi.fn(async () => ({ ok: true as const })),
    ...auth,
  };
  render(
    <AuthContext.Provider value={value}>
      <MessagesPage />
    </AuthContext.Provider>,
  );
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/mensajes');
  h.conversations.list.mockResolvedValue({ data: [summary({}), summary({ id: 'conv-2', counterpart_name: 'Luis Gómez', unread_count: 0 })] });
  h.conversations.get.mockResolvedValue({ data: summary({}) });
  h.conversations.messages.mockResolvedValue({ data: { data: [MINE, THEIRS] } });
  h.conversations.markRead.mockResolvedValue({ data: { marked: 1 } });
  h.conversations.send.mockResolvedValue({
    data: { id: 'm-2', conversation_id: 'conv-1', body: 'Gracias, ¿cuál es el precio?', sender_is_me: true, created_at: '2026-10-22T15:00:00Z', read_at: null },
  });
});

describe('MessagesPage', () => {
  it('a un anónimo le pide iniciar sesión', async () => {
    renderMessages({ status: 'anonymous', roles: [], user: null });

    expect(await screen.findByText(/Inicia sesión para ver tus conversaciones/)).toBeInTheDocument();
    expect(h.conversations.list).not.toHaveBeenCalled();
  });

  it('a una cuenta sin roles le ofrece activar comprador o productor', async () => {
    const value = renderMessages({ roles: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Activar rol comprador' }));
    expect(value.setRoleActive).toHaveBeenCalledWith('buyer', true);
    expect(h.conversations.list).not.toHaveBeenCalled();
  });

  it('lista las conversaciones con su contraparte, oferta y no leídos', async () => {
    renderMessages({});

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.getByLabelText('2 mensajes sin leer')).toBeInTheDocument();
  });

  it('abre una conversación, marca como leída y muestra los mensajes como texto', async () => {
    renderMessages({});

    await userEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    expect(await screen.findByText('¿Sigue disponible?')).toBeInTheDocument();
    expect(screen.getByText('Sí, tenemos disponible', { selector: 'p' })).toBeInTheDocument();
    await waitFor(() => expect(h.conversations.markRead).toHaveBeenCalledWith('conv-1'));
    expect(window.location.search).toBe('?c=conv-1');
  });

  it('envía el mensaje con el texto escrito, sin enviar identidad del remitente', async () => {
    renderMessages({});
    await userEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    await userEvent.type(await screen.findByRole('textbox', { name: /Escribe tu mensaje/ }), 'Gracias, ¿cuál es el precio?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() =>
      expect(h.conversations.send).toHaveBeenCalledWith('conv-1', 'Gracias, ¿cuál es el precio?'),
    );
    expect(await screen.findByText('Gracias, ¿cuál es el precio?')).toBeInTheDocument();
  });

  it('no permite enviar un mensaje vacío', async () => {
    renderMessages({});
    await userEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    expect(await screen.findByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(h.conversations.send).not.toHaveBeenCalled();
  });

  it('un tercero no tiene acceso: el backend responde 403 y se muestra el error', async () => {
    window.history.pushState({}, '', '/mensajes?c=conv-ajena');
    h.conversations.get.mockRejectedValue({
      response: { status: 403, data: { detail: 'No tienes acceso a esta conversación.' } },
    });
    renderMessages({});

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes acceso a esta conversación.');
    expect(h.conversations.messages).not.toHaveBeenCalled();
    expect(h.conversations.send).not.toHaveBeenCalled();
  });

  it('en conversación cerrada no ofrece enviar mensajes', async () => {
    h.conversations.get.mockResolvedValue({ data: summary({ status: 'closed' }) });
    renderMessages({});
    await userEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const thread = await screen.findByRole('region', { name: 'Conversación' });
    expect(await within(thread).findByText(/Esta conversación está cerrada/)).toBeInTheDocument();
    expect(within(thread).queryByRole('textbox')).not.toBeInTheDocument();
  });
});
