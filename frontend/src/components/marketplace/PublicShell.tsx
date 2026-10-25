import type { ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { navigateTo } from '@/components/public/publicRoutes';
import { MARKETPLACE_PATH, MESSAGES_PATH } from './marketplaceRoutes';
import '../styles/Marketplace.css';

interface PublicShellProps {
  tag: string;
  children: ReactNode;
}

/** Cabecera común de /mercado, /mercado/oferta/{id} y /mensajes. */
export function PublicShell({ tag, children }: PublicShellProps) {
  const { status } = useAuth();

  return (
    <div className="market-page">
      <header className="public-header market-header">
        <a
          className="public-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigateTo('/');
          }}
        >
          <span className="public-brand-name">RAÍCES CONECTADAS</span>
          <span className="public-brand-tag">{tag}</span>
        </a>
        <nav className="market-nav" aria-label="Secciones">
          <a
            href={MARKETPLACE_PATH}
            onClick={(event) => {
              event.preventDefault();
              navigateTo(MARKETPLACE_PATH);
            }}
          >
            Mercado
          </a>
          {status === 'authenticated' && (
            <a
              href={MESSAGES_PATH}
              onClick={(event) => {
                event.preventDefault();
                navigateTo(MESSAGES_PATH);
              }}
            >
              Mensajes
            </a>
          )}
        </nav>
        <AccountMenu />
      </header>
      <main className="market-main">{children}</main>
    </div>
  );
}
