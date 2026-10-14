import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { gamePublicUrl } from '@/services/gameScores';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

export async function copyToClipboard(url: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** Web Share API si existe; si no, portapapeles. Nunca lanza. */
export async function shareOrCopy(url: string, title: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Otro fallo de share: se intenta el portapapeles.
    }
  }
  return (await copyToClipboard(url)) ? 'copied' : 'unavailable';
}

interface ShareLinksProps {
  path: string;
  title: string;
}

const MESSAGES: Record<ShareOutcome, string> = {
  shared: 'Enlace compartido.',
  copied: 'Enlace copiado.',
  cancelled: '',
  unavailable: 'No fue posible copiar. Selecciona el enlace y cópialo manualmente.',
};

export function ShareLinks({ path, title }: ShareLinksProps) {
  const url = gamePublicUrl(path);
  const [showQr, setShowQr] = useState(false);
  const [message, setMessage] = useState('');

  const handleCopy = async () => {
    const copied = await copyToClipboard(url);
    setMessage(copied ? MESSAGES.copied : MESSAGES.unavailable);
  };

  const handleShare = async () => {
    const outcome = await shareOrCopy(url, title);
    setMessage(MESSAGES[outcome]);
  };

  return (
    <div className="share-links">
      <div className="share-actions">
        <button type="button" className="ui-btn ui-btn-ghost" onClick={handleCopy}>
          🔗 Copiar enlace
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={handleShare}>
          📤 Compartir
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
          📱 {showQr ? 'Ocultar QR' : 'Ver QR'}
        </button>
      </div>

      {message && <p className="share-message" role="status">{message}</p>}

      {showQr && (
        <div className="share-qr">
          <div className="qr-frame">
            <QRCodeSVG value={url} size={148} marginSize={1} title={`QR ${title}`} />
          </div>
          <p className="qr-caption">Escanea y juega</p>
          <input className="share-url" readOnly value={url} aria-label="Enlace del juego" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}
