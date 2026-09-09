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

export function AgentPanel({ municipalityCode, municipalityName, departmentCode }: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentAvailable, setAgentAvailable] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with welcome message
  useEffect(() => {
    const welcomeMessage: Message = {
      id: '0',
      role: 'assistant',
      content: municipalityName
        ? `Hola. Soy el Agente AgroMapa. Puedo ayudarte a consultar información territorial, estadísticas EVA 2024 y fincas registradas. Actualmente estás consultando ${municipalityName}.`
        : `Hola. Soy el Agente AgroMapa. Puedo ayudarte a consultar información territorial, estadísticas EVA 2024 y fincas registradas.`,
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
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

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await api.agent.chat({
        message: messageText,
        context: {
          department_code: departmentCode || undefined,
          municipality_code: municipalityCode,
          year: 2024,
        },
      });

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al conectar con el agente';

      if (errorMsg.includes('503') || errorMsg.includes('disabled')) {
        setAgentAvailable(false);
        setError('El Agente AgroMapa aún no está habilitado en este entorno.');
      } else {
        setError('No pude completar la consulta en este momento. Intenta de nuevo.');
      }

      // Add error message to chat
      const errorSystemMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: error || 'Hubo un error procesando tu pregunta.',
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
          <p>⚠️ El Agente AgroMapa aún no está habilitado</p>
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
                <span>AgroMapa está consultando los datos...</span>
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
              ? 'Pregúntale a AgroMapa (Shift+Enter para nueva línea)...'
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
