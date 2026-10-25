import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { AuthPrompt } from '@/components/auth/AuthPrompt';
import { PublicShell } from '@/components/marketplace/PublicShell';
import { formatDateTime } from '@/components/marketplace/formatters';
import { messagesPath } from '@/components/marketplace/marketplaceRoutes';
import {
  conversationsApi,
  MESSAGE_MAX_LENGTH,
  type ConversationMessage,
  type ConversationStatus,
  type ConversationSummary,
} from '@/services/conversations';
import { errorDetail } from '@/services/identity';
import '../styles/Messages.css';

// Polling ligero: sin websockets. Solo mientras la pestaña está visible.
export const LIST_POLL_MS = 30000;
export const THREAD_POLL_MS = 15000;

const ROLE_LABEL = { buyer: 'Comprador', producer: 'Productor' } as const;

function selectedIdFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('c');
  } catch {
    return null;
  }
}

function setSelectedInUrl(id: string | null) {
  const path = id ? messagesPath(id) : messagesPath();
  window.history.replaceState(window.history.state, '', path);
}

/** Pantalla /mensajes: solo para cuentas con rol comprador o productor. */
export function MessagesPage() {
  const { status, roles, setRoleActive } = useAuth();

  if (status === 'loading') return <PublicShell tag="Mensajes"><p className="auth-muted">Cargando tu cuenta…</p></PublicShell>;

  if (status === 'anonymous') {
    return (
      <PublicShell tag="Mensajes">
        <AuthPrompt title="Mensajes" message="Inicia sesión para ver tus conversaciones con compradores y productores." defaultChoice="buyer" />
      </PublicShell>
    );
  }

  if (roles.length === 0) {
    return (
      <PublicShell tag="Mensajes">
        <section className="auth-prompt" aria-label="Activar un rol">
          <p>Para usar los mensajes activa el rol comprador, productor o ambos. Puedes tener los dos en la misma cuenta.</p>
          <div className="auth-prompt-actions">
            <button type="button" className="auth-primary" onClick={() => void setRoleActive('buyer', true)}>
              Activar rol comprador
            </button>
            <button type="button" className="auth-secondary" onClick={() => void setRoleActive('producer', true)}>
              Activar rol productor
            </button>
          </div>
        </section>
      </PublicShell>
    );
  }

  return <Inbox />;
}

function Inbox() {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(selectedIdFromUrl);

  async function loadList() {
    try {
      const response = await conversationsApi.list();
      setConversations(response.data);
      setListError(null);
    } catch (err) {
      setListError(errorDetail(err, 'No pudimos cargar tus conversaciones.'));
    }
  }

  useEffect(() => {
    void loadList();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadList();
    }, LIST_POLL_MS);
    return () => window.clearInterval(timer);
    // loadList solo lee estado del servidor; se crea una vez por montaje.
  }, []);

  function select(id: string | null) {
    setSelectedId(id);
    setSelectedInUrl(id);
  }

  return (
    <PublicShell tag="Mensajes">
      <div className={`messages-layout ${selectedId ? 'has-selection' : ''}`}>
        <aside className="conversation-list" aria-label="Lista de conversaciones">
          <h1>Mis conversaciones</h1>
          {listError && (
            <p className="auth-error" role="alert">
              {listError}
            </p>
          )}
          {conversations === null && !listError && <p className="auth-muted">Cargando conversaciones…</p>}
          {conversations && conversations.length === 0 && (
            <p className="auth-muted">
              Aún no tienes conversaciones. Contacta a un productor desde una oferta del mercado.
            </p>
          )}
          {conversations && conversations.length > 0 && (
            <ul className="conversation-items">
              {conversations.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`conversation-item ${item.id === selectedId ? 'active' : ''}`}
                    aria-current={item.id === selectedId ? 'true' : undefined}
                    onClick={() => select(item.id)}
                  >
                    <span className="conversation-item-head">
                      <strong>{item.counterpart_name}</strong>
                      <span className="conversation-role">{ROLE_LABEL[item.my_role]}</span>
                    </span>
                    <span className="conversation-item-offer">{item.offer ? item.offer.crop_name : 'Oferta no disponible'}</span>
                    <span className="conversation-item-last">
                      {item.last_message_body
                        ? `${item.last_message_is_mine ? 'Tú: ' : ''}${item.last_message_body}`
                        : 'Sin mensajes todavía'}
                    </span>
                    <span className="conversation-item-meta">
                      <time dateTime={item.last_message_at ?? item.created_at}>
                        {formatDateTime(item.last_message_at ?? item.created_at)}
                      </time>
                      {item.unread_count > 0 && (
                        <span className="unread-badge" aria-label={`${item.unread_count} mensajes sin leer`}>
                          {item.unread_count}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="conversation-thread" aria-label="Conversación">
          {selectedId ? (
            <Thread
              key={selectedId}
              conversationId={selectedId}
              onBack={() => select(null)}
              onChanged={loadList}
            />
          ) : (
            <p className="thread-placeholder auth-muted">Selecciona una conversación para leer y responder.</p>
          )}
        </section>
      </div>
    </PublicShell>
  );
}

interface ThreadProps {
  conversationId: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
}

function Thread({ conversationId, onBack, onChanged }: ThreadProps) {
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const logRef = useRef<HTMLUListElement>(null);
  const countRef = useRef(0);

  // Carga inicial: cabecera (valida acceso) y mensajes; luego marca lo recibido como leído.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setAccessError(null);
    conversationsApi
      .get(conversationId)
      .then(async (summary) => {
        if (cancelled) return;
        setConversation(summary.data);
        const response = await conversationsApi.messages(conversationId);
        if (cancelled) return;
        setMessages(response.data.data);
        countRef.current = response.data.data.length;
        await conversationsApi.markRead(conversationId);
        if (!cancelled) await onChanged();
      })
      .catch((err) => {
        if (!cancelled) setAccessError(errorDetail(err, 'No pudimos abrir esta conversación.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // onChanged cambia de identidad en cada render del padre; la carga depende solo de la conversación.
  }, [conversationId]);

  // Sondeo ligero de la conversación abierta.
  useEffect(() => {
    if (accessError) return undefined;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await conversationsApi.messages(conversationId);
        setMessages(response.data.data);
        if (response.data.data.length !== countRef.current) {
          countRef.current = response.data.data.length;
          await conversationsApi.markRead(conversationId);
          await onChanged();
        }
      } catch {
        // Un fallo puntual de sondeo no borra lo que ya se ve; el próximo intento lo reintenta.
      }
    }, THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, accessError]);

  // Mantiene visible el último mensaje.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  if (accessError) {
    return (
      <div className="thread-header">
        <button type="button" className="messages-back" onClick={onBack}>
          ← Conversaciones
        </button>
        <p className="auth-error" role="alert">
          {accessError}
        </p>
      </div>
    );
  }

  const closed = conversation ? conversation.status !== 'active' : false;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending || closed) return;
    setSending(true);
    setSendError(null);
    try {
      const response = await conversationsApi.send(conversationId, body);
      setMessages((current) => [...current, response.data]);
      countRef.current += 1;
      setDraft('');
      await onChanged();
    } catch (err) {
      // El borrador se conserva para reintentar.
      setSendError(errorDetail(err, 'No pudimos enviar el mensaje. Intenta de nuevo.'));
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(next: ConversationStatus) {
    setStatusError(null);
    try {
      const response = await conversationsApi.setStatus(conversationId, next);
      setConversation(response.data);
      await onChanged();
    } catch (err) {
      setStatusError(errorDetail(err, 'No pudimos cambiar el estado de la conversación.'));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía en escritorio; en móvil el teclado añade saltos de línea con Enter.
    const finePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    if (event.key === 'Enter' && !event.shiftKey && finePointer) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="thread">
      <header className="thread-header">
        <button type="button" className="messages-back" onClick={onBack}>
          ← Conversaciones
        </button>
        {conversation && (
          <>
            <h2>{conversation.counterpart_name}</h2>
            <p className="auth-muted">
              {conversation.my_role === 'buyer' ? 'Productor' : 'Comprador'}
              {closed && ' · Conversación cerrada'}
            </p>
            <section className="thread-offer" aria-label="Contexto de la oferta">
              {conversation.offer ? (
                <p>
                  <strong>{conversation.offer.crop_name}</strong> · {conversation.offer.quantity}{' '}
                  {conversation.offer.unit} · {conversation.offer.farm_name} · {conversation.offer.municipality_name}
                </p>
              ) : (
                <p className="auth-muted">La oferta ya no está disponible.</p>
              )}
            </section>
            <div className="thread-status">
              {conversation.status === 'active' && (
                <button type="button" className="ui-btn ui-btn-ghost" onClick={() => void changeStatus('closed')}>
                  Cerrar conversación
                </button>
              )}
              {conversation.status !== 'active' && (
                <button type="button" className="ui-btn ui-btn-ghost" onClick={() => void changeStatus('active')}>
                  Reactivar conversación
                </button>
              )}
            </div>
            {statusError && (
              <p className="auth-error" role="alert">
                {statusError}
              </p>
            )}
          </>
        )}
      </header>

      {!loaded && <p className="auth-muted">Cargando mensajes…</p>}

      <ul className="message-log" ref={logRef} aria-label="Mensajes">
        {messages.map((message) => (
          <li key={message.id} className={message.sender_is_me ? 'message mine' : 'message theirs'}>
            <p className="message-body">{message.body}</p>
            <div className="message-meta">
              <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
              {message.sender_is_me && <span>{message.read_at ? 'Leído' : 'Enviado'}</span>}
            </div>
          </li>
        ))}
      </ul>

      {closed ? (
        <p className="auth-notice" role="status">
          Esta conversación está cerrada. Reactívala para seguir escribiendo.
        </p>
      ) : (
        <form className="message-composer" onSubmit={send}>
          <label>
            <span className="visually-hidden">Escribe tu mensaje</span>
            <textarea
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH}
              rows={2}
              placeholder="Escribe un mensaje…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
          </label>
          <div className="message-composer-actions">
            <span className="auth-muted" aria-live="polite">
              {draft.length}/{MESSAGE_MAX_LENGTH}
            </span>
            <button type="submit" className="auth-primary" disabled={sending || draft.trim().length === 0}>
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {sendError && (
            <p className="auth-error" role="alert">
              {sendError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
