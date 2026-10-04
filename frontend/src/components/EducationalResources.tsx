import '../styles/EducationalResources.css';

interface Resource {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'document' | 'template' | 'guide';
  tags: string[];
  status: 'available' | 'coming-soon';
}

const RESOURCES: Resource[] = [
  {
    id: '1',
    title: 'Introducción a la Biodiversidad Territorial',
    description: 'Conceptos básicos sobre biodiversidad y su importancia en territorios rurales',
    type: 'guide',
    tags: ['biodiversidad', 'educación', 'territorio'],
    status: 'coming-soon',
  },
  {
    id: '2',
    title: 'Guía de Cultivos Locales',
    description: 'Referencia completa de cultivos regionales y sus características',
    type: 'document',
    tags: ['cultivos', 'agricultura', 'referencia'],
    status: 'coming-soon',
  },
  {
    id: '3',
    title: 'Manejo Responsable de Residuos Agrícolas',
    description: 'Mejores prácticas para clasificación y tratamiento de residuos',
    type: 'guide',
    tags: ['residuos', 'sostenibilidad', 'prácticas'],
    status: 'coming-soon',
  },
  {
    id: '4',
    title: 'Plantilla de Plan de Cultivo',
    description: 'Formato descargable para planificar cultivos y producción',
    type: 'template',
    tags: ['planificación', 'cultivos', 'herramienta'],
    status: 'coming-soon',
  },
];

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    video: '🎥 Video',
    document: '📄 Documento',
    template: '📋 Plantilla',
    guide: '📖 Guía',
  };
  return labels[type] || type;
};

export function EducationalResources() {
  return (
    <div className="educational-resources">
      <div className="resources-header">
        <h2>📚 Recursos Educativos</h2>
        <p>Materiales para profundizar en biodiversidad, territorio y bioeconomía</p>
      </div>

      <div className="resources-categories">
        <div className="category-filter">
          <button className="filter-btn active">Todos</button>
          <button className="filter-btn">Videos</button>
          <button className="filter-btn">Documentos</button>
          <button className="filter-btn">Plantillas</button>
        </div>
      </div>

      <div className="resources-grid">
        {RESOURCES.map((resource) => (
          <div key={resource.id} className={`resource-card status-${resource.status}`}>
            <div className="resource-type">{getTypeLabel(resource.type)}</div>

            <h3>{resource.title}</h3>
            <p className="resource-description">{resource.description}</p>

            <div className="resource-tags">
              {resource.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>

            <div className="resource-action">
              {resource.status === 'available' ? (
                <button className="btn-access">Acceder</button>
              ) : (
                <span className="badge-coming">Próximamente</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="resources-note">
        <p>📌 Los recursos están siendo preparados. Vuelve pronto para acceder a materiales educativos completos.</p>
      </div>
    </div>
  );
}
