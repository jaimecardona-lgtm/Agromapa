import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/services/api';
import './AgentPanel.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: Date;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentPanelProps {
  municipalityCode?: string | null;
  municipalityName?: string | null;
  departmentCode?: string | null;
}

const SUGGESTIONS = [
  '¿Cuáles son los principales cultivos?',
  '¿Cuál tiene mayor producción?',
  '¿Cuánta área sembrada se reporta?',
  '¿Hay fincas registradas aquí?',
];

const getSessionStorageKey = (municipalityCode: string | null | undefined): string => {
  return municipalityCode ? `raices-chat-${municipalityCode}` : 'raices-chat-none';
};

const loadChatFromStorage = (municipalityCode: string | null | undefined): Message[] => {
  if (!municipalityCode) return [];
  try {
    const key = getSessionStorageKey(municipalityCode);
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredMessage[];
      return parsed.map((msg, idx) => ({
        id: `stored-${idx}`,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(),
      }));
    }
  } catch (e) {
    console.error('Failed to load chat from storage:', e);
  }
  return [];
};

const saveChatToStorage = (municipalityCode: string | null | undefined, messages: Message[]): void => {
  if (!municipalityCode) return;
  try {
    const key = getSessionStorageKey(municipalityCode);
    const toStore = messages
      .filter(m => m.role !== 'assistant' || !m.id.startsWith('error-'))
      .map(m => ({ role: m.role, content: m.content }));
    sessionStorage.setItem(key, JSON.stringify(toStore));
  } catch (e) {
    console.error('Failed to save chat to storage:', e);
  }
};

export function AgentPanel({ municipalityCode, municipalityName, departmentCode }: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentAvailable, setAgentAvailable] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load or initialize chat on municipalityCode change
  useEffect(() => {
    if (!municipalityCode) {
      setMessages([]);
      return;
    }

    // Try to restore from storage
    const stored = loadChatFromStorage(municipalityCode);
    if (stored.length > 0) {
      setMessages(stored);
    } else {
      // First time for this municipality - show welcome
      const welcomeMessage: Message = {
        id: '0',
        role: 'assistant',
        content: municipalityName
          ? `Hola. Soy el Agente de Raíces Conectadas. Puedo ayudarte a consultar información territorial, estadísticas EVA 2024 y fincas registradas. Actualmente estás consultando ${municipalityName}.`
          : `Hola. Soy el Agente de Raíces Conectadas. Puedo ayudarte a consultar información territorial, estadísticas EVA 2024 y fincas registradas.`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [municipalityCode, municipalityName]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (text?: string) => {
    const messageText = (text || input).trim();

    if (!messageText) return;
    if (!municipalityCode) {
      setError('Por favor, selecciona un municipio primero.');
      return;
    }

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Build history from previous messages (exclude errors, include only user/assistant)
      const history = newMessages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.id.startsWith('error-')))
        .slice(0, -1)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await api.agent.chat({
        message: messageText,
        context: {
          department_code: departmentCode || undefined,
          municipality_code: municipalityCode,
          year: 2024,
        },
        history,
      });

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources,
        timestamp: new Date(),
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);
      saveChatToStorage(municipalityCode, finalMessages);
      setError(null);
    } catch (err) {
      let displayError = 'Hubo un error procesando la consulta.';
      let status = 500;

      // Extract error details from Axios error
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as Record<string, unknown>;
        const response = axiosErr.response as Record<string, unknown> | undefined;
        status = (response?.status as number) || 500;
        const detail = (response?.data as Record<string, unknown>)?.detail as string | undefined;

        // Map HTTP status to user-friendly message
        switch (status) {
          case 429:
            displayError = 'El servicio de IA alcanzó temporalmente su límite de solicitudes. Intenta en unos momentos.';
            break;
          case 502:
          case 503:
            displayError = 'El asistente de IA está temporalmente no disponible. Por favor intenta de nuevo.';
            break;
          case 504:
            displayError = 'El agente tardó demasiado en responder. Intenta nuevamente.';
            break;
          case 500:
            displayError = 'Hubo un error procesando la consulta. Intenta de nuevo.';
            break;
          default:
            displayError = detail || displayError;
        }

        // Special case: agent not available
        if (status === 503 && detail && detail.includes('OpenRouter')) {
          setAgentAvailable(false);
          displayError = 'El Agente de Raíces Conectadas aún no está habilitado en este entorno.';
        }
      } else if (err instanceof Error) {
        displayError = err.message || displayError;
      }

      setError(displayError);

      // Add error message to chat (not saved to storage)
      const errorSystemMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: displayError,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorSystemMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!agentAvailable) {
    return (
      <div className="agent-panel unavailable">
        <div className="agent-unavailable-box">
          <p>⚠️ El Agente de Raíces Conectadas aún no está habilitado</p>
          <p className="small">
            Configura OpenRouter en el backend para activar el asistente inteligente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-panel">
      {/* Messages Area */}
      <div className="agent-messages">
        {messages.length === 1 && (
          <div className="agent-suggestions">
            <p>Sugerencias:</p>
            {SUGGESTIONS.map((suggestion, idx) => (
              <button
                key={idx}
                className="suggestion-btn"
                onClick={() => handleSendMessage(suggestion)}
                disabled={loading || !municipalityCode}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="messages-list">
          {messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              <div className="message-bubble">
                <div className="message-content">{msg.content}</div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="message-sources">
                    <span className="sources-label">Fuentes:</span>
                    <div className="sources-tags">
                      {msg.sources.map((source, idx) => (
                        <span key={idx} className="source-tag">
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <span className="message-time">
                {msg.timestamp.toLocaleTimeString('es-CO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))}
          {loading && (
            <div className="message message-assistant loading">
              <div className="message-bubble">
                <span className="spinner"></span>
                <span>Raíces Conectadas está consultando los datos...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error Display */}
      {error && <div className="agent-error">{error}</div>}

      {/* Input Area */}
      <div className="agent-input-box">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={
            municipalityCode
              ? 'Pregúntale a Raíces Conectadas (Shift+Enter para nueva línea)...'
              : 'Selecciona un municipio primero'
          }
          disabled={loading || !municipalityCode}
          className="agent-input"
          rows={1}
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={loading || !input.trim() || !municipalityCode}
          className="send-btn"
          title="Enviar pregunta"
        >
          {loading ? '⟳' : '→'}
        </button>
      </div>
    </div>
  );
}
