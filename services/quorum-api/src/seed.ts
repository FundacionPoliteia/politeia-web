import { assertRuntimeConfig, config } from './config.js';
import { initialCatalogs, initialProjects, initialSettings, initialWorkflow } from './seedData.js';
import { store } from './store.js';

assertRuntimeConfig();
if (config.dataStore !== 'firestore') throw new Error('El comando seed sólo escribe cuando DATA_STORE=firestore');

const workflow = initialWorkflow();
await store().set('workflows', workflow.id, workflow);
for (const item of initialCatalogs) await store().set('catalogs', item.id, item);
for (const project of initialProjects()) {
  const existing = await store().get('projects', project.id);
  if (!existing) await store().set('projects', project.id, project);
}
await store().set('settings', 'public', initialSettings());
console.info('Catálogos, configuración y seis borradores inicializados.');
