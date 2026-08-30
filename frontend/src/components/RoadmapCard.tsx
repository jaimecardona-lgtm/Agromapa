import './RoadmapCard.css';

interface RoadmapItem {
  name: string;
  description: string;
  icon: string;
}

const ROADMAP: RoadmapItem[] = [
  { name: 'Productores', description: 'Registro y caracterización de productores rurales', icon: '👨‍🌾' },
  { name: 'Producción', description: 'Cultivos, cantidades y temporadas de cosecha', icon: '🌾' },
  { name: 'Marketplace', description: 'Conexión entre productores y compradores', icon: '🤝' },
  { name: 'Analítica', description: 'Reportes y análisis productivos', icon: '📊' },
  { name: 'Datos Agroambientales', description: 'Integración de datos públicos', icon: '🌍' },
  { name: 'IA / RAG', description: 'Asistente inteligente y búsqueda semántica', icon: '🤖' },
];

export function RoadmapCard() {
  return (
    <div className="roadmap-section">
      <h3>Roadmap - Próximas Funcionalidades</h3>
      <div className="roadmap-grid">
        {ROADMAP.map((item) => (
          <div key={item.name} className="roadmap-item">
            <div className="roadmap-icon">{item.icon}</div>
            <div className="roadmap-name">{item.name}</div>
            <div className="roadmap-description">{item.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
