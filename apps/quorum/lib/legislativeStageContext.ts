import type { CatalogItem, LegislativeStageExplanation, ProjectStageExplanation, WorkflowDefinition, WorkflowStage } from '@politeia/quorum-contracts';

export type StageContextSource = {
  label: string;
  url: string;
};

export type LegislativeStageContext = {
  title: string;
  summary: string;
  contextualDetail: string;
  alert: string | null;
  sources: StageContextSource[];
};

type StageContextInput = {
  stage: WorkflowStage;
  workflow?: Pick<WorkflowDefinition, 'id' | 'version'>;
  chamber: CatalogItem | null;
  initiative: CatalogItem | null;
  explanations?: LegislativeStageExplanation[];
  projectExplanations?: ProjectStageExplanation[];
};

const CONSTITUTION_URL = 'https://www.argentina.gob.ar/normativa/nacional/ley-24430-804/texto';
const POPULAR_INITIATIVE_URL = 'https://www.argentina.gob.ar/normativa/nacional/ley-24747-41025/texto';
const DEPUTIES_INITIATIVE_URL = 'https://www.hcdn.gob.ar/secparl/dgral_info_parlamentaria/detalle/Iniciativa-legislativa/';
const DEPUTIES_SANCTION_URL = 'https://www.hcdn.gob.ar/secparl/dgral_info_parlamentaria/reglamentos/glosario/S/sancion-leyes.html';
const SENATE_PROCESS_URL = 'https://www.senado.gob.ar/parlamentario/tramite';

const constitution: StageContextSource = { label: 'Constitución Nacional', url: CONSTITUTION_URL };
const popularInitiativeLaw: StageContextSource = { label: 'Ley 24.747 de iniciativa popular', url: POPULAR_INITIATIVE_URL };
const deputiesInitiative: StageContextSource = { label: 'Diputados: iniciativa legislativa', url: DEPUTIES_INITIATIVE_URL };
const deputiesSanction: StageContextSource = { label: 'Diputados: formación y sanción', url: DEPUTIES_SANCTION_URL };
const senateProcess: StageContextSource = { label: 'Senado: trámite legislativo', url: SENATE_PROCESS_URL };

function normalize(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR');
}

function includesAny(value: string, options: string[]) {
  return options.some((option) => value.includes(option));
}

function chamberContext(chamber: CatalogItem | null) {
  const value = normalize(`${chamber?.id || ''} ${chamber?.label || ''}`);
  if (includesAny(value, ['diputad', 'camara baja'])) {
    return { origin: 'la Cámara de Diputados', reviewer: 'el Senado', kind: 'deputies' as const };
  }
  if (includesAny(value, ['senado', 'senador', 'camara alta'])) {
    return { origin: 'el Senado', reviewer: 'la Cámara de Diputados', kind: 'senate' as const };
  }
  return { origin: chamber?.label || 'la cámara de origen', reviewer: 'la cámara revisora', kind: 'unknown' as const };
}

function initiativeContext(initiative: CatalogItem | null) {
  const value = normalize(`${initiative?.id || ''} ${initiative?.label || ''}`);
  if (value.includes('popular')) return 'popular' as const;
  if (value.includes('ejecutiv')) return 'executive' as const;
  if (includesAny(value, ['legislativ', 'diputad', 'senador'])) return 'legislative' as const;
  return 'unknown' as const;
}

function stageKind(stage: WorkflowStage) {
  const value = normalize(`${stage.id} ${stage.label} ${stage.shortLabel}`);
  if (includesAny(value, ['mesa', 'entrada', 'ingreso', 'presentacion'])) return 'entry' as const;
  if (value.includes('comision') && !value.includes('dictamen')) return 'committees' as const;
  if (value.includes('dictamen')) return 'report' as const;
  if (includesAny(value, ['media sancion', 'primera sancion'])) return 'firstPassage' as const;
  if (includesAny(value, ['sancion definitiva', 'sancion completa', 'sancion'])) return 'finalPassage' as const;
  if (value.includes('promulg')) return 'promulgation' as const;
  if (value.includes('veto')) return 'veto' as const;
  if (includesAny(value, ['archiv', 'cerrad', 'caduc'])) return 'closed' as const;
  return 'custom' as const;
}

function popularOriginAlert(initiative: ReturnType<typeof initiativeContext>, chamber: ReturnType<typeof chamberContext>) {
  if (initiative !== 'popular' || chamber.kind !== 'senate') return null;
  return 'La iniciativa popular tiene origen constitucional obligatorio en Diputados. Si la ficha indica Senado como cámara de origen, el dato editorial necesita revisión.';
}

function contextualEntry(initiative: ReturnType<typeof initiativeContext>, chamber: ReturnType<typeof chamberContext>) {
  if (initiative === 'popular') {
    return {
      detail: 'En una iniciativa popular, la ciudadanía presenta el proyecto ante Diputados. Antes del trámite legislativo ordinario se controla su admisibilidad formal; además, hay materias que este mecanismo no puede abordar.',
      sources: [constitution, popularInitiativeLaw],
    };
  }
  if (initiative === 'executive') {
    return {
      detail: `Al provenir del Poder Ejecutivo, el proyecto puede ingresar por cualquiera de las cámaras, salvo reglas constitucionales o legales de origen especial. En esta ficha comienza en ${chamber.origin}. Por ejemplo, el presupuesto nacional debe iniciar en Diputados.`,
      sources: [constitution, deputiesInitiative],
    };
  }
  if (initiative === 'legislative') {
    return {
      detail: `Al ser una iniciativa legislativa, la presenta uno o más integrantes del Congreso en su respectiva cámara. En esta ficha el recorrido comienza en ${chamber.origin}.`,
      sources: [constitution, deputiesInitiative],
    };
  }
  return {
    detail: `El proyecto inicia su recorrido en ${chamber.origin}. La cámara y el tipo de iniciativa determinan si existe alguna regla especial de origen.`,
    sources: [constitution, deputiesInitiative],
  };
}

function contextualCommittees(initiative: ReturnType<typeof initiativeContext>, chamber: ReturnType<typeof chamberContext>) {
  if (initiative === 'popular') {
    return {
      detail: 'Este caso sí tiene un paso diferencial: la Comisión de Asuntos Constitucionales de Diputados debe resolver la admisibilidad formal dentro de 20 días hábiles. Una vez admitida, la propuesta sigue el tratamiento legislativo común en las comisiones competentes y el Congreso debe tratarla expresamente dentro de 12 meses.',
      sources: [popularInitiativeLaw, senateProcess],
    };
  }
  if (initiative === 'executive') {
    return {
      detail: `Que el texto provenga del Poder Ejecutivo no crea, por sí solo, un circuito general de comisiones diferente: en ${chamber.origin} se gira a una o más comisiones según la materia. Las reglas especiales dependen del tema del proyecto, no solamente de quién lo inició.`,
      sources: [deputiesInitiative, senateProcess],
    };
  }
  if (initiative === 'legislative') {
    return {
      detail: `En ${chamber.origin}, la presidencia de la cámara gira el expediente a una o más comisiones competentes según su contenido. La autoría legislativa no le da un circuito distinto: el tema define qué comisiones intervienen.`,
      sources: [senateProcess],
    };
  }
  return {
    detail: `En ${chamber.origin}, el expediente se asigna a una o más comisiones de acuerdo con la materia. Allí se analiza el texto antes de su eventual tratamiento en el recinto.`,
    sources: [senateProcess],
  };
}

function applyEditorialExplanation(
  context: LegislativeStageContext,
  input: StageContextInput,
): LegislativeStageContext {
  const matching = input.workflow ? input.explanations
    ?.filter((item) => item.workflowId === input.workflow?.id && item.workflowVersion === input.workflow?.version && item.stageId === input.stage.id)
    .filter((item) => item.chamberId === null || item.chamberId === input.chamber?.id)
    .filter((item) => item.initiativeTypeId === null || item.initiativeTypeId === input.initiative?.id)
    .sort((left, right) => Number(Boolean(right.chamberId)) + Number(Boolean(right.initiativeTypeId)) - Number(Boolean(left.chamberId)) - Number(Boolean(left.initiativeTypeId)))[0] : null;
  const editorial = matching ? { ...context, summary: matching.summary, contextualDetail: matching.contextualDetail } : context;
  const project = input.projectExplanations?.find((item) => item.stageId === input.stage.id);
  return project ? { ...editorial, summary: project.summary, contextualDetail: project.contextualDetail } : editorial;
}

export function getLegislativeStageContext(input: StageContextInput): LegislativeStageContext {
  const { stage, chamber, initiative } = input;
  const kind = stageKind(stage);
  const chamberData = chamberContext(chamber);
  const initiativeKind = initiativeContext(initiative);
  const alert = popularOriginAlert(initiativeKind, chamberData);

  if (kind === 'entry') {
    const context = contextualEntry(initiativeKind, chamberData);
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'Es la presentación formal del proyecto y su incorporación al trámite parlamentario. Desde aquí recibe expediente y se define su recorrido inicial.',
      contextualDetail: context.detail,
      alert,
      sources: context.sources,
    }, input);
  }

  if (kind === 'committees') {
    const context = contextualCommittees(initiativeKind, chamberData);
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'Las comisiones especializadas estudian el proyecto, pueden debatir cambios, recibir información y preparar una recomendación para la cámara.',
      contextualDetail: context.detail,
      alert,
      sources: context.sources,
    }, input);
  }

  if (kind === 'report') {
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'El dictamen expresa la recomendación de una comisión y ordena el texto que podría llegar al recinto. No equivale todavía a la aprobación de la cámara.',
      contextualDetail: initiativeKind === 'popular'
        ? 'Superada la admisibilidad especial de la iniciativa popular, los dictámenes de las comisiones competentes se producen dentro del trámite legislativo común en Diputados.'
        : `En este proyecto, el dictamen corresponde al trabajo de las comisiones de ${chamberData.origin}. Puede haber más de un dictamen si no existe una posición única.`,
      alert,
      sources: initiativeKind === 'popular' ? [popularInitiativeLaw, senateProcess] : [senateProcess],
    }, input);
  }

  if (kind === 'firstPassage') {
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'La cámara de origen aprobó el proyecto. Todavía no es una ley: debe pasar a la otra cámara.',
      contextualDetail: `Como el trámite de esta ficha comenzó en ${chamberData.origin}, la media sanción lo envía a ${chamberData.reviewer}, que actúa como cámara revisora.${initiativeKind === 'popular' ? ' En las iniciativas populares, Diputados es necesariamente la cámara de origen.' : ''}`,
      alert,
      sources: [constitution, deputiesSanction],
    }, input);
  }

  if (kind === 'finalPassage') {
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'Las dos cámaras aprobaron un mismo texto. Si la cámara revisora introduce cambios, el proyecto debe volver a la cámara de origen para resolverlos.',
      contextualDetail: `En esta ficha, ${chamberData.origin} es la cámara de origen y ${chamberData.reviewer} la revisora. Esta etapa indica que el Congreso completó su decisión; el proyecto pasa al Poder Ejecutivo.`,
      alert,
      sources: [constitution, deputiesSanction],
    }, input);
  }

  if (kind === 'promulgation') {
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'El Poder Ejecutivo acepta el proyecto sancionado y lo convierte en ley. La promulgación puede ser expresa o producirse si no lo devuelve dentro del plazo constitucional.',
      contextualDetail: 'La cámara de origen y el tipo de iniciativa ya no cambian este paso: después de la sanción del Congreso, la decisión corresponde al Poder Ejecutivo. La publicación oficial completa la comunicación de la nueva ley.',
      alert,
      sources: [constitution, deputiesSanction],
    }, input);
  }

  if (kind === 'veto') {
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'El Poder Ejecutivo objetó total o parcialmente el proyecto sancionado y lo devolvió al Congreso.',
      contextualDetail: `El tratamiento vuelve primero a ${chamberData.origin}. El Congreso puede insistir con una mayoría de dos tercios en cada cámara; si lo logra, el proyecto se convierte en ley.`,
      alert,
      sources: [constitution],
    }, input);
  }

  if (kind === 'closed') {
    return applyEditorialExplanation({
      title: stage.label,
      summary: 'El expediente dejó de estar en tratamiento activo. El archivo no implica que el texto haya sido aprobado ni promulgado.',
      contextualDetail: 'La causa concreta puede ser caducidad, retiro u otra decisión parlamentaria y debe surgir de la cronología o de las fuentes del proyecto. La cámara de origen y la iniciativa no cambian por sí solas ese significado.',
      alert,
      sources: [senateProcess],
    }, input);
  }

  return applyEditorialExplanation({
    title: stage.label,
    summary: stage.description || 'Esta etapa forma parte del recorrido legislativo configurado para el proyecto.',
    contextualDetail: `Su efecto concreto debe leerse según el reglamento de ${chamberData.origin}, la materia del proyecto y sus fuentes. El nombre de una etapa personalizada no permite inferir por sí solo consecuencias jurídicas adicionales.`,
    alert,
    sources: [constitution, senateProcess],
  }, input);
}
