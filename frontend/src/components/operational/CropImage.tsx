import { useState } from 'react';
import '../styles/CropImages.css';

export const ILLUSTRATIVE_LABEL = 'Imagen ilustrativa generada por IA';
export const ILLUSTRATION_DISCLAIMER =
  'Imagen ilustrativa generada por IA. No corresponde necesariamente al estado actual del producto.';

interface CropImageProps {
  /** URL persistida del backend. Sin URL se muestra un placeholder agrícola propio. */
  src?: string | null;
  cropName: string;
  /** 'thumb' para listas y mapa; 'card' para tarjetas; 'hero' para el detalle. */
  variant?: 'thumb' | 'card' | 'hero';
}

/** Imagen de cultivo: lazy, etiquetada como IA, con placeholder si no hay URL o si la imagen no carga. */
export function CropImage({ src, cropName, variant = 'card' }: CropImageProps) {
  const [broken, setBroken] = useState(false);
  const initial = cropName.trim().charAt(0).toUpperCase() || '?';

  if (!src || broken) {
    return (
      <div className={`crop-image crop-image--placeholder crop-image--${variant}`} aria-hidden="true">
        <span>{initial}</span>
      </div>
    );
  }

  return (
    <figure className={`crop-image crop-image--${variant}`}>
      <img
        src={src}
        alt={`Ilustración de ${cropName.trim()}`}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
      <figcaption className="illustration-badge">{variant === 'hero' ? ILLUSTRATIVE_LABEL : 'Imagen ilustrativa IA'}</figcaption>
    </figure>
  );
}

/** Aviso bajo imágenes de IA en el detalle. No reemplaza la información real del producto. */
export function IllustrationDisclaimer() {
  return <p className="illustration-disclaimer">{ILLUSTRATION_DISCLAIMER}</p>;
}
