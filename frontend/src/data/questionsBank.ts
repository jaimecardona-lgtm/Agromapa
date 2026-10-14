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
      { id: 'b', text: 'Solo plantas en un lugar' },
      { id: 'c', text: 'Un área con organismos vivos que interactúan con su ambiente físico' },
      { id: 'd', text: 'Un tipo de clima' },
    ],
    correctAnswerId: 'c',
    explanation: 'Un ecosistema incluye todos los organismos vivos (plantas, animales, microorganismos) y el ambiente físico donde viven e interactúan.',
    type: 'multiple-choice',
  },
  {
    id: 'bio-004',
    category: 'biodiversidad',
    difficulty: 'basico',
    question: '¿Qué se entiende por biodiversidad?',
    options: [
      { id: 'a', text: 'El número de animales que hay en una granja' },
      { id: 'b', text: 'La variedad de seres vivos en un ecosistema o en el planeta' },
      { id: 'c', text: 'La cantidad de agua que lleva un río' },
      { id: 'd', text: 'El tipo de suelo predominante de una región' },
    ],
    correctAnswerId: 'b',
    explanation: 'La biodiversidad es la variedad de especies, genes y ecosistemas. Una mayor diversidad suele dar más estabilidad a los sistemas productivos.',
    type: 'multiple-choice',
  },

  // BÁSICO - Agronomía
  {
    id: 'agr-001',
    category: 'agronomia',
    difficulty: 'basico',
    question: '¿Cuál es el propósito principal de una rotación de cultivos?',
    options: [
      { id: 'a', text: 'Cosechar más rápido' },
      { id: 'b', text: 'Reducir el precio de la cosecha' },
      { id: 'c', text: 'Usar menos agua' },
      { id: 'd', text: 'Mantener la fertilidad del suelo y reducir plagas' },
    ],
    correctAnswerId: 'd',
    explanation: 'La rotación de cultivos ayuda a mantener los nutrientes del suelo, reduce la acumulación de plagas específicas y mejora la salud del suelo a largo plazo.',
    type: 'multiple-choice',
  },
  {
    id: 'agr-003',
    category: 'agronomia',
    difficulty: 'basico',
    question: '¿Para qué sirve un análisis de suelo antes de sembrar?',
    options: [
      { id: 'a', text: 'Medir la altura de las plantas' },
      { id: 'b', text: 'Contar las semillas disponibles' },
      { id: 'c', text: 'Conocer el pH y los nutrientes del suelo para planear la fertilización' },
      { id: 'd', text: 'Calcular el precio de venta de la cosecha' },
    ],
    correctAnswerId: 'c',
    explanation: 'Un análisis de suelo informa el pH, la materia orgánica y los nutrientes disponibles, lo que permite decidir si se necesita encalado y qué fertilizantes aplicar.',
    type: 'multiple-choice',
  },

  // BÁSICO - Residuos
  {
    id: 'res-001',
    category: 'residuos',
    difficulty: 'basico',
    question: 'Un envase de plástico vacío y enjuagado. ¿Cómo se clasifica?',
    options: [
      { id: 'a', text: 'Reciclable' },
      { id: 'b', text: 'Orgánico' },
      { id: 'c', text: 'Contaminante' },
      { id: 'd', text: 'Compostable' },
    ],
    correctAnswerId: 'a',
    explanation: 'Un envase de plástico vacío y enjuagado es reciclable. Debe separarse para su procesamiento industrial; sin enjuagar, puede contaminar otros materiales reciclables.',
    type: 'multiple-choice',
  },
  {
    id: 'res-004',
    category: 'residuos',
    difficulty: 'basico',
    question: '¿Qué debe hacerse con las pilas o baterías usadas?',
    options: [
      { id: 'a', text: 'Enterrarlas en el terreno' },
      { id: 'b', text: 'Mezclarlas con residuos orgánicos' },
      { id: 'c', text: 'Quemarlas en la finca' },
      { id: 'd', text: 'Entregarlas en un punto de recolección especial' },
    ],
    correctAnswerId: 'd',
    explanation: 'Las pilas contienen metales pesados que contaminan suelo y agua. Deben entregarse en puntos de recolección especializados.',
    type: 'multiple-choice',
  },

  // BÁSICO - Agua
  {
    id: 'agua-002',
    category: 'agua',
    difficulty: 'basico',
    question: '¿Qué práctica ayuda a reducir el desperdicio de agua en la finca?',
    options: [
      { id: 'a', text: 'Dejar los grifos abiertos mientras se trabaja' },
      { id: 'b', text: 'Reparar fugas en tuberías y tanques' },
      { id: 'c', text: 'Regar al mediodía, con el sol más fuerte' },
      { id: 'd', text: 'Lavar la maquinaria con manguera sin control' },
    ],
    correctAnswerId: 'b',
    explanation: 'Las fugas en tuberías y tanques desperdician agua de forma continua. Repararlas y monitorear el consumo es una de las medidas más básicas de ahorro.',
    type: 'multiple-choice',
  },

  // BÁSICO - Cultivos
  {
    id: 'cul-001',
    category: 'cultivos',
    difficulty: 'basico',
    question: '¿Qué aporte hace un cultivo de leguminosa, como el fríjol, al suelo?',
    options: [
      { id: 'a', text: 'Fija nitrógeno del aire en asociación con bacterias de sus raíces' },
      { id: 'b', text: 'Aumenta la acidez del suelo' },
      { id: 'c', text: 'Elimina toda la materia orgánica' },
      { id: 'd', text: 'Reduce la absorción de agua por las raíces' },
    ],
    correctAnswerId: 'a',
    explanation: 'Las leguminosas forman nódulos en sus raíces con bacterias del género Rhizobium, que transforman el nitrógeno atmosférico en una forma que la planta puede usar, enriqueciendo el suelo.',
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
      { id: 'c', text: 'Nitrógeno, Fósforo, Magnesio' },
      { id: 'd', text: 'Calcio, Magnesio, Azufre' },
    ],
    correctAnswerId: 'b',
    explanation: 'NPK representa los tres macronutrientes principales: Nitrógeno (crecimiento vegetativo), Fósforo (raíces y energía) y Potasio (resistencia y calidad).',
    type: 'multiple-choice',
  },

  // INTERMEDIO - Suelos
  {
    id: 'sue-001',
    category: 'suelos',
    difficulty: 'intermedio',
    question: 'Un suelo con pH 4.8 presenta alta acidez. ¿Qué práctica es común para elevar gradualmente su pH?',
    options: [
      { id: 'a', text: 'Añadir sal de mesa (NaCl)' },
      { id: 'b', text: 'Incrementar amonio' },
      { id: 'c', text: 'Aplicar cal agrícola' },
      { id: 'd', text: 'Aplicar ácido sulfúrico' },
    ],
    correctAnswerId: 'c',
    explanation: 'La cal agrícola (carbonato de calcio) neutraliza la acidez y eleva el pH. Es una práctica habitual en suelos ácidos, siempre guiada por un análisis de suelo.',
    type: 'multiple-choice',
  },
  {
    id: 'sue-002',
    category: 'suelos',
    difficulty: 'intermedio',
    question: '¿Qué es la materia orgánica del suelo y por qué es importante?',
    options: [
      { id: 'a', text: 'Solo arena y arcilla' },
      { id: 'b', text: 'Sal que impide el crecimiento de las raíces' },
      { id: 'c', text: 'Roca madre sin alterar' },
      { id: 'd', text: 'Restos vegetales y animales descompuestos que mejoran la estructura, la retención de agua y los nutrientes' },
    ],
    correctAnswerId: 'd',
    explanation: 'La materia orgánica proviene de restos vegetales y animales en descomposición. Mejora la estructura del suelo, su capacidad de retener agua y el suministro de nutrientes.',
    type: 'multiple-choice',
  },

  // INTERMEDIO - Nutrición
  {
    id: 'nut-002',
    category: 'nutricion',
    difficulty: 'intermedio',
    question: '¿Qué síntoma es típico de la deficiencia de nitrógeno en una planta?',
    options: [
      { id: 'a', text: 'Amarillamiento generalizado de las hojas viejas' },
      { id: 'b', text: 'Hojas con tonos morados en el ápice' },
      { id: 'c', text: 'Bordes necróticos en las hojas nuevas' },
      { id: 'd', text: 'Frutos sin semillas' },
    ],
    correctAnswerId: 'a',
    explanation: 'El nitrógeno es un nutriente móvil dentro de la planta, por lo que la planta lo redistribuye hacia las hojas nuevas y la deficiencia se nota primero en las hojas viejas, que se vuelven amarillas.',
    type: 'multiple-choice',
  },

  // INTERMEDIO - Cultivos
  {
    id: 'cul-002',
    category: 'cultivos',
    difficulty: 'intermedio',
    question: '¿Qué es el acolchado (mulching) en un cultivo?',
    options: [
      { id: 'a', text: 'Quemar los residuos antes de sembrar' },
      { id: 'b', text: 'Inundar el terreno de forma permanente' },
      { id: 'c', text: 'Cubrir el suelo con paja u otros restos vegetales' },
      { id: 'd', text: 'Retirar toda la capa orgánica del suelo' },
    ],
    correctAnswerId: 'c',
    explanation: 'El acolchado cubre el suelo con paja, hojas u otros materiales. Ayuda a conservar la humedad, reducir la temperatura superficial y limitar el crecimiento de malezas.',
    type: 'multiple-choice',
  },

  // INTERMEDIO - Residuos
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

  // INTERMEDIO - Bioeconomía
  {
    id: 'bioe-001',
    category: 'bioeconomia',
    difficulty: 'intermedio',
    question: '¿Qué es bioeconomía circular?',
    options: [
      { id: 'a', text: 'Usar residuos agrícolas como materia prima para nuevos productos' },
      { id: 'b', text: 'Solo producir alimentos' },
      { id: 'c', text: 'Circular dinero entre agricultores' },
      { id: 'd', text: 'Llevar cosechas en círculos' },
    ],
    correctAnswerId: 'a',
    explanation: 'La bioeconomía circular aprovecha residuos agrícolas, biomasa y subproductos para crear nuevos productos de valor, reduciendo desperdicios.',
    type: 'multiple-choice',
  },

  // INTERMEDIO - Agua
  {
    id: 'agua-001',
    category: 'agua',
    difficulty: 'intermedio',
    question: '¿Cómo se compara el riego por goteo con el riego por inundación en el uso del agua?',
    options: [
      { id: 'a', text: 'La inundación siempre usa menos agua que el goteo' },
      { id: 'b', text: 'Ambos métodos usan exactamente la misma cantidad de agua en cualquier cultivo' },
      { id: 'c', text: 'El goteo no puede usarse en cultivos agrícolas' },
      { id: 'd', text: 'El goteo lleva el agua directamente a la zona de las raíces y suele requerir menos agua' },
    ],
    correctAnswerId: 'd',
    explanation: 'El riego por goteo suministra agua directamente a la zona radicular y, en general, reduce las pérdidas por evaporación y escorrentía frente a la inundación. El ahorro real depende del manejo y del cultivo.',
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
    explanation: 'La glucosa (C6H12O6) es un monosacárido. Es un producto de la fotosíntesis y una fuente central de energía para las células.',
    type: 'multiple-choice',
  },
  {
    id: 'quim-002',
    category: 'quimica',
    difficulty: 'avanzado',
    question: '¿Cuál es el pH de una solución neutra a 25 °C?',
    options: [
      { id: 'a', text: '0' },
      { id: 'b', text: '7' },
      { id: 'c', text: '14' },
      { id: 'd', text: '1' },
    ],
    correctAnswerId: 'b',
    explanation: 'A 25 °C, una solución neutra tiene pH 7. Valores menores indican acidez y valores mayores indican basicidad.',
    type: 'multiple-choice',
  },
  {
    id: 'nut-001',
    category: 'nutricion',
    difficulty: 'avanzado',
    question: '¿Qué macronutriente forma parte esencial de ATP y ácidos nucleicos?',
    options: [
      { id: 'a', text: 'Potasio' },
      { id: 'b', text: 'Calcio' },
      { id: 'c', text: 'Fósforo' },
      { id: 'd', text: 'Magnesio' },
    ],
    correctAnswerId: 'c',
    explanation: 'El fósforo es componente clave del ATP (energía celular) y del DNA y RNA.',
    type: 'multiple-choice',
  },
  {
    id: 'nut-003',
    category: 'nutricion',
    difficulty: 'avanzado',
    question: '¿Qué función cumple el potasio en la planta?',
    options: [
      { id: 'a', text: 'Formar la clorofila como componente estructural' },
      { id: 'b', text: 'Regular la apertura de los estomas y el balance hídrico' },
      { id: 'c', text: 'Formar la pared celular de celulosa' },
      { id: 'd', text: 'Fijar el nitrógeno del aire' },
    ],
    correctAnswerId: 'b',
    explanation: 'El potasio participa en la regulación osmótica de las células guarda, controlando la apertura de los estomas y, con ello, el balance de agua de la planta.',
    type: 'multiple-choice',
  },
  {
    id: 'bio-003',
    category: 'biologia',
    difficulty: 'avanzado',
    question: '¿Cuál es el propósito de la fotosíntesis?',
    options: [
      { id: 'a', text: 'Liberar dióxido de carbono a la atmósfera' },
      { id: 'b', text: 'Descomponer la materia orgánica del suelo' },
      { id: 'c', text: 'Transportar agua desde las raíces hasta las hojas' },
      { id: 'd', text: 'Convertir la energía luminosa en energía química (glucosa)' },
    ],
    correctAnswerId: 'd',
    explanation: 'La fotosíntesis convierte la energía luminosa en energía química almacenada en glucosa, usando CO2 y agua y liberando oxígeno. Es la base de casi todas las cadenas alimentarias.',
    type: 'multiple-choice',
  },
  {
    id: 'bio-005',
    category: 'biologia',
    difficulty: 'avanzado',
    question: '¿En qué proceso celular se libera la energía almacenada en la glucosa para uso de la célula?',
    options: [
      { id: 'a', text: 'Respiración celular' },
      { id: 'b', text: 'Fotosíntesis' },
      { id: 'c', text: 'Ósmosis' },
      { id: 'd', text: 'Transpiración' },
    ],
    correctAnswerId: 'a',
    explanation: 'En la respiración celular, la glucosa se oxida en presencia de oxígeno para producir ATP, la moneda energética de la célula.',
    type: 'multiple-choice',
  },

  // AVANZADO - Residuos
  {
    id: 'res-002',
    category: 'residuos',
    difficulty: 'avanzado',
    question: 'Un envase vacío de agroquímico. ¿Cuál es el procedimiento correcto?',
    options: [
      { id: 'a', text: 'Quemarlo en la finca' },
      { id: 'b', text: 'Enterrarlo' },
      { id: 'c', text: 'Entregarlo en el programa de devolución posconsumo o en un centro de acopio autorizado' },
      { id: 'd', text: 'Reutilizarlo para almacenar agua' },
    ],
    correctAnswerId: 'c',
    explanation: 'Los envases de agroquímicos requieren manejo posconsumo específico: no deben quemarse, enterrarse ni reutilizarse. Deben entregarse en el programa de devolución posconsumo o en un centro de acopio autorizado.',
    type: 'multiple-choice',
  },

  // AVANZADO - Agua
  {
    id: 'agua-003',
    category: 'agua',
    difficulty: 'avanzado',
    question: '¿Qué indicador expresa el volumen total de agua dulce utilizado en la producción de un bien, incluyendo el agua de lluvia y la de riego?',
    options: [
      { id: 'a', text: 'Índice de cosecha' },
      { id: 'b', text: 'Coeficiente de Manning' },
      { id: 'c', text: 'Huella hídrica' },
      { id: 'd', text: 'Coeficiente de Gini' },
    ],
    correctAnswerId: 'c',
    explanation: 'La huella hídrica mide el uso de agua dulce asociado a la producción de un bien o servicio, distinguiendo agua verde (lluvia), azul (riego) y gris (contaminación).',
    type: 'multiple-choice',
  },

  // AVANZADO - Bioeconomía
  {
    id: 'bioe-002',
    category: 'bioeconomia',
    difficulty: 'avanzado',
    question: '¿Qué principio caracteriza a la economía circular?',
    options: [
      { id: 'a', text: 'Extraer, producir y desechar' },
      { id: 'b', text: 'Aumentar el consumo de materias primas vírgenes' },
      { id: 'c', text: 'Eliminar el reciclaje para reducir costos' },
      { id: 'd', text: 'Mantener materiales y productos en uso el mayor tiempo posible' },
    ],
    correctAnswerId: 'd',
    explanation: 'La economía circular busca alargar la vida útil de materiales y productos, reduciendo la extracción de recursos y la generación de residuos.',
    type: 'multiple-choice',
  },

  // EXPERTO - Suelos y ciclos biogeoquímicos
  {
    id: 'exp-001',
    category: 'suelos',
    difficulty: 'experto',
    question: '¿Qué proceso del ciclo del nitrógeno convierte el amonio (NH4+) en nitrato (NO3-)?',
    options: [
      { id: 'a', text: 'Desnitrificación' },
      { id: 'b', text: 'Amonificación' },
      { id: 'c', text: 'Nitrificación' },
      { id: 'd', text: 'Fijación biológica' },
    ],
    correctAnswerId: 'c',
    explanation: 'La nitrificación es la oxidación microbiana del amonio a nitrito y luego a nitrato. La desnitrificación hace lo contrario: devuelve nitrógeno a la atmósfera como gas.',
    type: 'multiple-choice',
  },
  {
    id: 'exp-005',
    category: 'suelos',
    difficulty: 'experto',
    question: '¿Qué describe la capacidad de intercambio catiónico (CIC) del suelo?',
    options: [
      { id: 'a', text: 'La velocidad de infiltración del agua' },
      { id: 'b', text: 'El color del horizonte superficial' },
      { id: 'c', text: 'La capacidad de retener y liberar cationes como Ca2+, Mg2+ y K+ gracias a cargas negativas de arcillas y materia orgánica' },
      { id: 'd', text: 'La capacidad de absorber aniones de cloro' },
    ],
    correctAnswerId: 'c',
    explanation: 'La CIC refleja cuántos cationes puede retener el suelo sobre superficies con carga negativa, como las arcillas y la materia orgánica. Influye en la disponibilidad de nutrientes.',
    type: 'multiple-choice',
  },

  // EXPERTO - Biología del suelo y fisiología vegetal
  {
    id: 'exp-002',
    category: 'biologia',
    difficulty: 'experto',
    question: '¿Qué función cumplen los hongos micorrízicos arbusculares en la relación con las raíces?',
    options: [
      { id: 'a', text: 'Ayudan a la planta a absorber fósforo y agua, recibiendo carbono a cambio' },
      { id: 'b', text: 'Producen el oxígeno de la atmósfera' },
      { id: 'c', text: 'Descomponen plásticos en el suelo' },
      { id: 'd', text: 'Fijan dióxido de carbono en forma de carbonatos' },
    ],
    correctAnswerId: 'a',
    explanation: 'Las micorrizas arbusculares extienden el alcance de las raíces, mejorando la absorción de fósforo y agua. A cambio, la planta les suministra carbono fotosintético.',
    type: 'multiple-choice',
  },
  {
    id: 'exp-003',
    category: 'biologia',
    difficulty: 'experto',
    question: '¿Qué es el punto de compensación lumínica de una planta?',
    options: [
      { id: 'a', text: 'La luz máxima que la planta soporta sin sufrir daños' },
      { id: 'b', text: 'La hora del día con mayor temperatura' },
      { id: 'c', text: 'El momento en que la planta inicia la floración' },
      { id: 'd', text: 'La intensidad de luz en la que la fotosíntesis iguala a la respiración, sin ganancia neta de carbono' },
    ],
    correctAnswerId: 'd',
    explanation: 'En el punto de compensación, el carbono fijado por fotosíntesis equivale al consumido por respiración. Por debajo de ese nivel de luz la planta tiene balance de carbono negativo.',
    type: 'multiple-choice',
  },
  {
    id: 'exp-004',
    category: 'agua',
    difficulty: 'experto',
    question: '¿Qué describe mejor el potencial hídrico de una planta?',
    options: [
      { id: 'a', text: 'La cantidad de agua almacenada en la raíz' },
      { id: 'b', text: 'La energía libre del agua en la planta, relativa al agua pura, que determina hacia dónde se mueve' },
      { id: 'c', text: 'La velocidad de crecimiento foliar' },
      { id: 'd', text: 'El volumen de lluvia anual de la región' },
    ],
    correctAnswerId: 'b',
    explanation: 'El potencial hídrico cuantifica la energía del agua en un tejido vegetal. El agua se mueve de zonas de mayor a menor potencial hídrico, desde el suelo hasta la atmósfera.',
    type: 'multiple-choice',
  },
  {
    id: 'exp-006',
    category: 'bioeconomia',
    difficulty: 'experto',
    question: 'En un análisis de ciclo de vida de un producto agrícola, ¿qué es la unidad funcional?',
    options: [
      { id: 'a', text: 'El número de empleados de la finca' },
      { id: 'b', text: 'El costo de la maquinaria utilizada' },
      { id: 'c', text: 'El área de la parcela sembrada' },
      { id: 'd', text: 'La referencia cuantificada del servicio o producto a la que se asocian todas las entradas y salidas del sistema' },
    ],
    correctAnswerId: 'd',
    explanation: 'La unidad funcional es la base de comparación del análisis de ciclo de vida (por ejemplo, por kilogramo de producto). Todos los impactos se reportan respecto a ella para que las comparaciones sean justas.',
    type: 'multiple-choice',
  },

  // EXPERTO - Nutrición y química del suelo
  {
    id: 'exp-007',
    category: 'nutricion',
    difficulty: 'experto',
    question: '¿Qué es la mineralización de la materia orgánica en el suelo?',
    options: [
      { id: 'a', text: 'La conversión de nutrientes orgánicos en formas inorgánicas disponibles para las plantas, por acción microbiana' },
      { id: 'b', text: 'La formación de minerales de arcilla a partir de roca' },
      { id: 'c', text: 'La acumulación de sales en la superficie del suelo' },
      { id: 'd', text: 'La pérdida de nitrógeno en forma de gas' },
    ],
    correctAnswerId: 'a',
    explanation: 'Durante la mineralización, los microorganismos descomponen la materia orgánica y liberan formas como amonio, fósforo y azufre disponibles para las plantas.',
    type: 'multiple-choice',
  },
  {
    id: 'exp-008',
    category: 'quimica',
    difficulty: 'experto',
    question: '¿Por qué la relación C/N de los residuos orgánicos afecta su descomposición?',
    options: [
      { id: 'a', text: 'La relación C/N no influye en la actividad de los microorganismos' },
      { id: 'b', text: 'Relaciones C/N muy altas tienden a inmovilizar nitrógeno mineral durante la descomposición' },
      { id: 'c', text: 'Relaciones C/N altas liberan amonio más rápido que las bajas, siempre' },
      { id: 'd', text: 'La relación C/N depende solo del clima' },
    ],
    correctAnswerId: 'b',
    explanation: 'Con residuos muy ricos en carbono, los microorganismos consumen el nitrógeno disponible para construir su biomasa, lo que puede limitar temporalmente el nitrógeno para las plantas.',
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
