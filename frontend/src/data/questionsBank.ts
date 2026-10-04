export type Difficulty = 'basico' | 'intermedio' | 'avanzado' | 'experto';
export type Category = 'agronomia' | 'biodiversidad' | 'suelos' | 'quimica' | 'biologia' | 'bioeconomia' | 'cultivos' | 'residuos' | 'agua' | 'nutricion';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  category: Category;
  difficulty: Difficulty;
  question: string;
  options: QuestionOption[];
  correctAnswerId: string;
  explanation: string;
  type: 'multiple-choice' | 'true-false' | 'chain' | 'matching' | 'lightning';
}

export const QUESTIONS_BANK: Question[] = [
  // BÁSICO - Biodiversidad
  {
    id: 'bio-001',
    category: 'biodiversidad',
    difficulty: 'basico',
    question: '¿Cuál es el rol principal de las abejas en los ecosistemas?',
    options: [
      { id: 'a', text: 'Producir miel solamente' },
      { id: 'b', text: 'Polinizar plantas y flores' },
      { id: 'c', text: 'Controlar plagas' },
      { id: 'd', text: 'Purificar el aire' },
    ],
    correctAnswerId: 'b',
    explanation: 'Las abejas son polinizadores clave. Al moverse entre flores, transfieren polen permitiendo la reproducción de plantas y la producción de alimentos.',
    type: 'multiple-choice',
  },
  {
    id: 'bio-002',
    category: 'biodiversidad',
    difficulty: 'basico',
    question: '¿Qué es un ecosistema?',
    options: [
      { id: 'a', text: 'Un grupo de animales similares' },
      { id: 'b', text: 'Un área con organismos vivos que interactúan' },
      { id: 'c', text: 'Solo plantas en un lugar' },
      { id: 'd', text: 'Un tipo de clima' },
    ],
    correctAnswerId: 'b',
    explanation: 'Un ecosistema incluye todos los organismos vivos (plantas, animales, microorganismos) y el ambiente físico donde viven e interactúan.',
    type: 'multiple-choice',
  },
  {
    id: 'agr-001',
    category: 'agronomia',
    difficulty: 'basico',
    question: '¿Cuál es el propósito principal de una rotación de cultivos?',
    options: [
      { id: 'a', text: 'Cosechar más rápido' },
      { id: 'b', text: 'Mantener la fertilidad del suelo y reducir plagas' },
      { id: 'c', text: 'Reducir el precio de la cosecha' },
      { id: 'd', text: 'Usar menos agua' },
    ],
    correctAnswerId: 'b',
    explanation: 'La rotación de cultivos restaura nutrientes del suelo, reduce la acumulación de plagas específicas y mejora la salud del suelo a largo plazo.',
    type: 'multiple-choice',
  },

  // INTERMEDIO - Agronomía
  {
    id: 'agr-002',
    category: 'agronomia',
    difficulty: 'intermedio',
    question: '¿Cuál es la fórmula NPK en fertilizantes y qué representa?',
    options: [
      { id: 'a', text: 'Nitrógeno, Potasio, Calcio' },
      { id: 'b', text: 'Nitrógeno, Fósforo, Potasio' },
      { id: 'c', text: 'Neopreno, Platino, Kripton' },
      { id: 'd', text: 'Níquel, Paladio, Kriptón' },
    ],
    correctAnswerId: 'b',
    explanation: 'NPK representa los tres macronutrientes principales: Nitrógeno (crecimiento verde), Fósforo (raíces y energía) y Potasio (resistencia y calidad).',
    type: 'multiple-choice',
  },
  {
    id: 'sue-001',
    category: 'suelos',
    difficulty: 'intermedio',
    question: 'Un suelo con pH 4.8 presenta alta acidez. ¿Qué práctica es común para elevar gradualmente su pH?',
    options: [
      { id: 'a', text: 'Aplicar cal agrícola' },
      { id: 'b', text: 'Añadir sal de mesa (NaCl)' },
      { id: 'c', text: 'Aplicar ácido sulfúrico' },
      { id: 'd', text: 'Incrementar amonio' },
    ],
    correctAnswerId: 'a',
    explanation: 'La cal agrícola (CaCO3) neutraliza la acidez elevando el pH. Es la práctica estándar recomendada para suelos ácidos en agricultura.',
    type: 'multiple-choice',
  },

  // AVANZADO - Química y Biología
  {
    id: 'quim-001',
    category: 'quimica',
    difficulty: 'avanzado',
    question: '¿Cuál es la fórmula molecular de la glucosa?',
    options: [
      { id: 'a', text: 'C6H12O6' },
      { id: 'b', text: 'CO2' },
      { id: 'c', text: 'CH4' },
      { id: 'd', text: 'C2H5OH' },
    ],
    correctAnswerId: 'a',
    explanation: 'La glucosa (C6H12O6) es un monosacárido fundamental. Es el producto directo de la fotosíntesis y la fuente primaria de energía en células.',
    type: 'multiple-choice',
  },
  {
    id: 'nut-001',
    category: 'nutricion',
    difficulty: 'avanzado',
    question: '¿Qué macronutriente forma parte esencial de ATP y ácidos nucleicos?',
    options: [
      { id: 'a', text: 'Potasio' },
      { id: 'b', text: 'Fósforo' },
      { id: 'c', text: 'Calcio' },
      { id: 'd', text: 'Magnesio' },
    ],
    correctAnswerId: 'b',
    explanation: 'El Fósforo es componente clave de ATP (energía celular) y de DNA/RNA. Sin fósforo no hay vida celular ni reproducción.',
    type: 'multiple-choice',
  },
  {
    id: 'bio-003',
    category: 'biologia',
    difficulty: 'avanzado',
    question: '¿Cuál es el propósito de la fotosíntesis?',
    options: [
      { id: 'a', text: 'Absorber dióxido de carbono' },
      { id: 'b', text: 'Convertir luz solar en energía química (glucosa)' },
      { id: 'c', text: 'Solo producir oxígeno' },
      { id: 'd', text: 'Eliminar impurezas del aire' },
    ],
    correctAnswerId: 'b',
    explanation: 'La fotosíntesis convierte energía solar en glucosa (energía química) usando CO2 y agua. Es la base de casi todas las cadenas alimentarias.',
    type: 'multiple-choice',
  },

  // RESIDUOS Y SOSTENIBILIDAD
  {
    id: 'res-001',
    category: 'residuos',
    difficulty: 'basico',
    question: 'Un envase de plástico vacío. ¿Cómo se clasifica?',
    options: [
      { id: 'a', text: 'Orgánico' },
      { id: 'b', text: 'Reciclable' },
      { id: 'c', text: 'Contaminante' },
      { id: 'd', text: 'Compostable' },
    ],
    correctAnswerId: 'b',
    explanation: 'El plástico es reciclable. Se debe separar para procesamiento industrial que genera nuevos productos.',
    type: 'multiple-choice',
  },
  {
    id: 'res-002',
    category: 'residuos',
    difficulty: 'avanzado',
    question: 'Un envase vacío de agroquímico. ¿Cuál es el procedimiento correcto?',
    options: [
      { id: 'a', text: 'Quemarlo en la finca' },
      { id: 'b', text: 'Enterrarlo' },
      { id: 'c', text: 'Seguir procedimiento posconsumo (devolución a distribuidor)' },
      { id: 'd', text: 'Reutilizarlo para agua' },
    ],
    correctAnswerId: 'c',
    explanation: 'Los recipientes de agroquímicos requieren MANEJO POSCONSUMO específico. No pueden quemarse, enterrarse o reutilizarse. Deben devolverse al distribuidor para disposición segura.',
    type: 'multiple-choice',
  },
  {
    id: 'res-003',
    category: 'residuos',
    difficulty: 'intermedio',
    question: 'Residuos vegetales de cosecha. ¿Cuál es su mejor destino?',
    options: [
      { id: 'a', text: 'Quemarlos' },
      { id: 'b', text: 'Compostar o incorporar al suelo como materia orgánica' },
      { id: 'c', text: 'Enterrarlos profundamente' },
      { id: 'd', text: 'Transportarlos al vertedero' },
    ],
    correctAnswerId: 'b',
    explanation: 'Los residuos vegetales se pueden compostar o incorporar como materia orgánica, mejorando la estructura y fertilidad del suelo.',
    type: 'multiple-choice',
  },

  // BIOECONOMÍA
  {
    id: 'bioe-001',
    category: 'bioeconomia',
    difficulty: 'intermedio',
    question: '¿Qué es bioeconomía circular?',
    options: [
      { id: 'a', text: 'Solo producir alimentos' },
      { id: 'b', text: 'Usar residuos agrícolas como materia prima para nuevos productos' },
      { id: 'c', text: 'Circular dinero entre agricultores' },
      { id: 'd', text: 'Llevar cosechas en círculos' },
    ],
    correctAnswerId: 'b',
    explanation: 'Bioeconomía circular: aprovechar residuos agrícolas, biomasa y subproductos para crear nuevos productos de alto valor, reduciendo desperdicios.',
    type: 'multiple-choice',
  },

  // AGUA
  {
    id: 'agua-001',
    category: 'agua',
    difficulty: 'intermedio',
    question: '¿Cuál es la importancia del riego por goteo vs riego por inundación?',
    options: [
      { id: 'a', text: 'El riego por goteo es más barato' },
      { id: 'b', text: 'El riego por goteo usa menos agua y es más eficiente' },
      { id: 'c', text: 'El riego por inundación es siempre mejor' },
      { id: 'd', text: 'Ambos usan la misma agua' },
    ],
    correctAnswerId: 'b',
    explanation: 'Riego por goteo: suministra agua directamente a raíces, reduce evaporación, ahorra 30-70% de agua y mejora rendimiento de cultivos.',
    type: 'multiple-choice',
  },
];

export function getQuestionsByDifficulty(difficulty: Difficulty): Question[] {
  return QUESTIONS_BANK.filter(q => q.difficulty === difficulty);
}

export function getQuestionsByCategory(category: Category): Question[] {
  return QUESTIONS_BANK.filter(q => q.category === category);
}

export function getRandomQuestion(difficulty?: Difficulty): Question {
  const filtered = difficulty ? getQuestionsByDifficulty(difficulty) : QUESTIONS_BANK;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function getRandomQuestions(count: number, difficulty?: Difficulty): Question[] {
  const filtered = difficulty ? getQuestionsByDifficulty(difficulty) : QUESTIONS_BANK;
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function shuffleOptions(question: Question): QuestionOption[] {
  return [...question.options].sort(() => Math.random() - 0.5);
}
