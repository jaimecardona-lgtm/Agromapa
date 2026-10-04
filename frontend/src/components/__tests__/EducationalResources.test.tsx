import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EducationalResources } from '../EducationalResources';

describe('EducationalResources', () => {
  it('renders header', () => {
    render(<EducationalResources />);
    expect(screen.getByText('📚 Recursos Educativos')).toBeInTheDocument();
  });

  it('renders all resource cards', () => {
    render(<EducationalResources />);
    expect(screen.getByText('Introducción a la Biodiversidad Territorial')).toBeInTheDocument();
    expect(screen.getByText('Guía de Cultivos Locales')).toBeInTheDocument();
    expect(screen.getByText('Manejo Responsable de Residuos Agrícolas')).toBeInTheDocument();
    expect(screen.getByText('Plantilla de Plan de Cultivo')).toBeInTheDocument();
  });

  it('displays coming soon badges for demo resources', () => {
    render(<EducationalResources />);
    const comingSoonBadges = screen.getAllByText('Próximamente');
    expect(comingSoonBadges.length).toBeGreaterThan(0);
  });

  it('renders category filter buttons', () => {
    render(<EducationalResources />);
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Videos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument();
  });

  it('shows resource descriptions', () => {
    render(<EducationalResources />);
    expect(screen.getByText(/Conceptos básicos sobre biodiversidad/)).toBeInTheDocument();
    expect(screen.getByText(/Referencia completa de cultivos/)).toBeInTheDocument();
  });

  it('displays resource tags', () => {
    render(<EducationalResources />);
    expect(screen.getByText('biodiversidad')).toBeInTheDocument();
    expect(screen.getByText('educación')).toBeInTheDocument();
    expect(screen.getAllByText('cultivos').length).toBeGreaterThan(0);
  });

  it('marks all resources as coming soon in demo', () => {
    render(<EducationalResources />);
    const resourceCards = screen.getAllByText(/📌 Los recursos están siendo preparados/);
    expect(resourceCards.length).toBeGreaterThan(0);
  });
});
