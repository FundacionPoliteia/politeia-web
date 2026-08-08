'use client';

import { useMemo, useState } from 'react';
import type { CatalogItem, LegislativeStageExplanation, ProjectStageExplanation, WorkflowDefinition } from '@politeia/quorum-contracts';
import { getLegislativeStageContext } from '@/lib/legislativeStageContext';

type StageExplanationEditorProps = {
  value: LegislativeStageExplanation[];
  workflows: WorkflowDefinition[];
  catalogs: CatalogItem[];
  onChange: (value: LegislativeStageExplanation[]) => void;
};

function workflowKey(workflow: WorkflowDefinition) {
  return `${workflow.id}::${workflow.version}`;
}

function ruleKey(rule: Pick<LegislativeStageExplanation, 'workflowId' | 'workflowVersion' | 'stageId' | 'chamberId' | 'initiativeTypeId'>) {
  return [rule.workflowId, rule.workflowVersion, rule.stageId, rule.chamberId || '*', rule.initiativeTypeId || '*'].join('::');
}

export default function StageExplanationEditor({ value, workflows, catalogs, onChange }: StageExplanationEditorProps) {
  const orderedWorkflows = useMemo(() => [...workflows].sort((left, right) => Number(right.active) - Number(left.active) || right.version - left.version), [workflows]);
  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState(() => workflowKey(orderedWorkflows[0]));
  const workflow = orderedWorkflows.find((item) => workflowKey(item) === selectedWorkflowKey) || orderedWorkflows[0];
  const stages = useMemo(() => workflow ? [...workflow.stages].filter((stage) => stage.active).sort((left, right) => left.order - right.order) : [], [workflow]);
  const [stageId, setStageId] = useState(() => stages[0]?.id || '');
  const selectedStage = stages.find((stage) => stage.id === stageId) || stages[0];
  const [chamberId, setChamberId] = useState('');
  const [initiativeTypeId, setInitiativeTypeId] = useState('');
  const chambers = catalogs.filter((item) => item.kind === 'chamber' && item.active).sort((left, right) => left.order - right.order);
  const initiatives = catalogs.filter((item) => item.kind === 'initiative' && item.active).sort((left, right) => left.order - right.order);
  const chamber = chambers.find((item) => item.id === chamberId) || null;
  const initiative = initiatives.find((item) => item.id === initiativeTypeId) || null;
  const selection = workflow && selectedStage ? {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    stageId: selectedStage.id,
    chamberId: chamber?.id || null,
    initiativeTypeId: initiative?.id || null,
  } : null;
  const exactRule = selection ? value.find((item) => ruleKey(item) === ruleKey(selection)) || null : null;
  const fallback = workflow && selectedStage ? getLegislativeStageContext({ stage: selectedStage, workflow, chamber, initiative }) : null;
  const stageRules = workflow && selectedStage ? value.filter((item) => item.workflowId === workflow.id && item.workflowVersion === workflow.version && item.stageId === selectedStage.id) : [];

  function selectWorkflow(nextKey: string) {
    const nextWorkflow = orderedWorkflows.find((item) => workflowKey(item) === nextKey);
    setSelectedWorkflowKey(nextKey);
    setStageId(nextWorkflow?.stages.filter((stage) => stage.active).sort((left, right) => left.order - right.order)[0]?.id || '');
  }

  function updateField(field: 'summary' | 'contextualDetail', nextValue: string) {
    if (!selection || !fallback) return;
    const nextRule: LegislativeStageExplanation = {
      ...selection,
      summary: exactRule?.summary || fallback.summary,
      contextualDetail: exactRule?.contextualDetail || fallback.contextualDetail,
      [field]: nextValue,
    };
    onChange([...value.filter((item) => ruleKey(item) !== ruleKey(selection)), nextRule]);
  }

  function removeRule(rule: LegislativeStageExplanation) {
    onChange(value.filter((item) => ruleKey(item) !== ruleKey(rule)));
  }

  function chooseRule(rule: LegislativeStageExplanation) {
    setSelectedWorkflowKey(`${rule.workflowId}::${rule.workflowVersion}`);
    setStageId(rule.stageId);
    setChamberId(rule.chamberId || '');
    setInitiativeTypeId(rule.initiativeTypeId || '');
  }

  if (!workflow || !selectedStage || !fallback) return <section className="stage-explanation-editor"><p>No hay un flujo activo disponible para configurar explicaciones.</p></section>;

  return <section className="stage-explanation-editor">
    <div className="stage-editor-heading">
      <div><h3>Explicaciones contextuales del recorrido</h3><p>Definí un texto general por etapa o creá variantes para una cámara, una iniciativa o una combinación concreta.</p></div>
      <span className="status-pill">{value.length} variante{value.length === 1 ? '' : 's'} editorial{value.length === 1 ? '' : 'es'}</span>
    </div>
    <div className="stage-editor-selectors">
      <label className="field"><span>Flujo versionado</span><select value={selectedWorkflowKey} onChange={(event) => selectWorkflow(event.target.value)}>{orderedWorkflows.map((item) => <option value={workflowKey(item)} key={workflowKey(item)}>{item.name} · v{item.version}{item.active ? ' · activo' : ' · histórico'}</option>)}</select></label>
      <label className="field"><span>Etapa</span><select value={selectedStage.id} onChange={(event) => setStageId(event.target.value)}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select></label>
      <label className="field"><span>Cámara de origen</span><select value={chamberId} onChange={(event) => setChamberId(event.target.value)}><option value="">Cualquier cámara</option>{chambers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label className="field"><span>Tipo de iniciativa</span><select value={initiativeTypeId} onChange={(event) => setInitiativeTypeId(event.target.value)}><option value="">Cualquier iniciativa</option>{initiatives.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    </div>
    <div className={`stage-editor-mode ${exactRule ? 'custom' : 'default'}`}>
      <strong>{exactRule ? 'Variante editorial' : 'Texto jurídico inicial'}</strong>
      <span>{exactRule ? 'Esta combinación tiene texto propio. La variante más específica prevalece en la ficha pública.' : 'Todavía no hay una variante para esta combinación. Al editar un campo se creará automáticamente.'}</span>
    </div>
    <label className="field"><span>Explicación general de la etapa</span><textarea value={exactRule?.summary || fallback.summary} maxLength={1000} onChange={(event) => updateField('summary', event.target.value)} /></label>
    <label className="field"><span>Qué cambia en esta cámara e iniciativa</span><textarea value={exactRule?.contextualDetail || fallback.contextualDetail} maxLength={2500} onChange={(event) => updateField('contextualDetail', event.target.value)} /></label>
    <div className="stage-editor-preview">
      <span>Vista previa del contexto</span>
      <div><small>Origen: {chamber?.label || 'cualquier cámara'}</small><small>Iniciativa: {initiative?.label || 'cualquier iniciativa'}</small></div>
      <strong>{selectedStage.label}</strong>
      <p>{exactRule?.summary || fallback.summary}</p>
      <p>{exactRule?.contextualDetail || fallback.contextualDetail}</p>
    </div>
    {exactRule && <button className="button ghost" type="button" onClick={() => removeRule(exactRule)}>Restaurar texto jurídico inicial para esta combinación</button>}
    {stageRules.length > 0 && <div className="stage-editor-variants"><strong>Variantes guardadas para {selectedStage.label}</strong>{stageRules.map((rule) => {
      const ruleChamber = catalogs.find((item) => item.id === rule.chamberId)?.label || 'Cualquier cámara';
      const ruleInitiative = catalogs.find((item) => item.id === rule.initiativeTypeId)?.label || 'Cualquier iniciativa';
      return <div key={ruleKey(rule)}><button type="button" onClick={() => chooseRule(rule)}><span>{ruleChamber}</span><span>{ruleInitiative}</span></button><button type="button" className="stage-variant-remove" onClick={() => removeRule(rule)} aria-label={`Quitar variante ${ruleChamber}, ${ruleInitiative}`}>×</button></div>;
    })}</div>}
    <p className="field-help">La advertencia sobre combinaciones jurídicamente incompatibles y los enlaces a fuentes oficiales permanecen protegidos por el sistema.</p>
  </section>;
}

type ProjectStageExplanationEditorProps = {
  value: ProjectStageExplanation[];
  workflow: WorkflowDefinition;
  chamber: CatalogItem | null;
  initiative: CatalogItem | null;
  globalExplanations: LegislativeStageExplanation[];
  onChange: (value: ProjectStageExplanation[]) => void;
};

export function ProjectStageExplanationEditor({ value, workflow, chamber, initiative, globalExplanations, onChange }: ProjectStageExplanationEditorProps) {
  const stages = useMemo(() => [...workflow.stages].filter((stage) => stage.active).sort((left, right) => left.order - right.order), [workflow]);
  const [stageId, setStageId] = useState(stages[0]?.id || '');
  const stage = stages.find((item) => item.id === stageId) || stages[0];
  const projectRule = value.find((item) => item.stageId === stage?.id) || null;
  const inherited = stage ? getLegislativeStageContext({ stage, workflow, chamber, initiative, explanations: globalExplanations }) : null;

  function updateField(field: 'summary' | 'contextualDetail', nextValue: string) {
    if (!stage || !inherited) return;
    const nextRule: ProjectStageExplanation = {
      stageId: stage.id,
      summary: projectRule?.summary || inherited.summary,
      contextualDetail: projectRule?.contextualDetail || inherited.contextualDetail,
      [field]: nextValue,
    };
    onChange([...value.filter((item) => item.stageId !== stage.id), nextRule]);
  }

  function remove() {
    if (stage) onChange(value.filter((item) => item.stageId !== stage.id));
  }

  if (!stage || !inherited) return null;

  return <details className="project-stage-explanations">
    <summary><span><strong>Explicaciones personalizadas de la timeline</strong><small>{value.length ? `${value.length} etapa${value.length === 1 ? '' : 's'} con texto propio para este proyecto` : 'Opcional · usa la configuración editorial general'}</small></span><span aria-hidden="true">⌄</span></summary>
    <div className="project-stage-explanations-body">
      <p>Usalo sólo cuando este expediente necesite una aclaración excepcional. Este texto prevalece sobre la variante general de cámara e iniciativa.</p>
      <label className="field"><span>Etapa a personalizar</span><select value={stage.id} onChange={(event) => setStageId(event.target.value)}>{stages.map((item) => <option value={item.id} key={item.id}>{item.label}{value.some((rule) => rule.stageId === item.id) ? ' · personalizada' : ''}</option>)}</select></label>
      <div className={`stage-editor-mode ${projectRule ? 'custom' : 'default'}`}><strong>{projectRule ? 'Texto propio del proyecto' : 'Texto heredado'}</strong><span>{projectRule ? 'Se verá únicamente en esta ficha cuando el lector explore la etapa.' : 'Actualmente usa la explicación global más específica disponible.'}</span></div>
      <label className="field"><span>Explicación general de la etapa</span><textarea value={projectRule?.summary || inherited.summary} maxLength={1000} onChange={(event) => updateField('summary', event.target.value)} /></label>
      <label className="field"><span>Explicación aplicada a este proyecto</span><textarea value={projectRule?.contextualDetail || inherited.contextualDetail} maxLength={2500} onChange={(event) => updateField('contextualDetail', event.target.value)} /></label>
      {projectRule && <button className="button ghost" type="button" onClick={remove}>Volver al texto editorial general para esta etapa</button>}
    </div>
  </details>;
}
