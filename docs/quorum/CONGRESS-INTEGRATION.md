# Integración con fuentes legislativas

## Alcance inicial

Las fuentes iniciales son el conjunto público `legisladores` de la Honorable Cámara de Diputados de la Nación (HCDN) y el JSON `Listado de Senadores Vigentes` del Honorable Senado de la Nación. Se usan para asistir la carga de perfiles —nombre, distrito, partido o alianza cuando la fuente lo informa, bloque, mandato y enlace oficial—, no como fuente jurídica suficiente para describir un proyecto de ley ni como autoridad editorial de Quórum.

Quedan fuera de esta fase:

- publicación automática;
- expedientes, votaciones, asistencia y scraping HTML;
- conciliación automática de personas ante coincidencias dudosas;
- actualización silenciosa de perfiles ya publicados.

## Límites de confianza

1. `externalSources` registra el responsable, dataset, URL, licencia, modo y estado operativo.
2. Cada descarga se identifica por SHA-256 y se archiva comprimida en un bucket privado separado por entorno.
3. El adaptador valida campos requeridos, fechas, forma del JSON y un mínimo plausible de bancas vigentes.
4. Si cambia el contrato o cae el recuento por debajo del umbral, el snapshot queda en cuarentena. No reemplaza el último conjunto válido.
5. Los registros normalizados viven en `externalLegislators`, separados de `legislators`.
6. Un editor elige el destino y cada campo a copiar. La operación crea `externalEntityLinks` y `fieldProvenance`.
7. Una ficha pública nunca se sobrescribe: primero debe prepararse o editarse un borrador y luego pasar por la publicación editorial normal.

Las atribuciones de ambas cámaras y el enlace oficial correspondiente se conservan en cada registro importado. Senado se consume desde su JSON oficial; la tabla HTML no se scrapea.

## Modos y llaves

Hay tres interruptores acumulativos y un modo:

- `CONGRESS_IMPORT_ENABLED`: llave maestra.
- `HCDN_IMPORT_ENABLED`: habilita sólo el adaptador de Diputados.
- `SENATE_IMPORT_ENABLED`: habilita sólo el adaptador del Senado.
- `CONGRESS_IMPORT_MODE=shadow`: descarga, valida y almacena; permite inspección técnica.
- `CONGRESS_IMPORT_MODE=assisted`: además habilita el flujo editorial asistido.
- `CONGRESS_IMPORT_MODE=active`: reservado para una fase futura; no implica publicación automática en la implementación actual.

Si la llave maestra o la llave de una cámara está apagada, su sincronización devuelve `integration_disabled`. La carga bicameral exige ambas fuentes habilitadas y confirmadas. Producción debe quedar apagada hasta completar UAT y observación en staging.

## Primera activación en staging

1. Aplicar Terraform con los tres interruptores en `false`. Confirmar que existe el bucket `...-source-snapshots`, con acceso público bloqueado y permiso `objectCreator` sólo para la cuenta de la API.
2. Desplegar la API y comprobar `GET /v1/health`.
3. Configurar en `terraform.tfvars`, sólo para staging:

   ```hcl
   congress_import_enabled = { staging = true, production = false }
   hcdn_import_enabled      = { staging = true, production = false }
   senate_import_enabled    = { staging = true, production = false }
   congress_import_mode     = { staging = "shadow", production = "shadow" }
   ```

4. Revisar `terraform plan`: sólo deben cambiar variables de Cloud Run; nunca producción.
5. Aplicar y abrir Gestión → Legisladores con una cuenta administradora.
6. Sincronizar Diputados y Senado una sola vez. Verificar estado exitoso, 257 y 72 registros al 3 de agosto de 2026 (los valores pueden variar por reemplazos), hash/snapshot y ambos objetos privados en Storage.
7. Repetir la sincronización sin cambios. Debe finalizar como `unchanged` y no crear otro snapshot.
8. Buscar al menos cinco personas de distritos y bloques diferentes. Comparar manualmente contra el perfil oficial enlazado.
9. Pasar staging a `assisted` e importar campos hacia perfiles privados de prueba. Confirmar vínculo/procedencia en Firestore.
10. Para la carga inicial, pulsar “Importar todos los legisladores”, revisar los dos snapshots indicados y reconfirmar. La operación crea únicamente perfiles privados faltantes, aparta coincidencias dudosas y puede repetirse sin duplicar.
11. Verificar que la suma de creados, ya vinculados, pendientes de revisión y fallidos coincida con el total del snapshot. Un valor `failed` mayor a cero requiere reejecución y revisión antes de continuar.
12. Publicar un perfil de prueba sólo después de revisión humana. Confirmar que una nueva importación hacia esa ficha es rechazada.

## Entorno local persistente

El desarrollo cotidiano usa `DATA_STORE=firestore`, `FIRESTORE_DATABASE_ID=quorum-staging` y el bucket privado `politeia-quorum-quorum-staging-source-snapshots`. Por eso una comprobación o importación iniciada desde el gestor permanece disponible después de reiniciar la API. El navegador consulta siempre el backend local; nunca llama directamente a Diputados, Senado, Firestore o Storage.

Antes de sincronizar, ejecutar `npm run quorum:verify:store`. Para cargar por primera vez ambas cámaras se puede usar el flujo administrativo o `npm run quorum:import:legislators`; ambos conservan revisión humana y perfiles privados.

## Prueba local efímera opcional

En `services/quorum-api/.env`, mantener `DATA_STORE=memory` y agregar:

```dotenv
CONGRESS_IMPORT_ENABLED=true
HCDN_IMPORT_ENABLED=true
SENATE_IMPORT_ENABLED=true
CONGRESS_IMPORT_MODE=assisted
HCDN_MINIMUM_CURRENT_LEGISLATORS=200
SENATE_MINIMUM_CURRENT_LEGISLATORS=70
```

Reiniciar `npm run quorum:api:dev`, abrir `http://localhost:3100/gestion`, entrar en “Legisladores” y sincronizar con una cuenta administradora. En memoria, los snapshots se identifican con una URL `memory://` y todo lo descargado/importado se pierde al detener la API. Esto permite probar la interfaz sin tocar Firestore, Storage ni el contenido público.

La carga masiva tiene confirmación administrativa y exige el identificador exacto de los dos últimos snapshots. Para cada legislador crea un perfil privado, un vínculo oficial y cinco registros de procedencia (nombre, distrito, bloque e inicio/fin de mandato); Senado suma partido o alianza. Si ya existe un vínculo, lo omite; si encuentra una coincidencia manual sin vínculo, la separa para revisión en lugar de generar un duplicado.

## Operación cotidiana y ciclo de 90 días

La API conserva el último snapshot válido como caché privado. La búsqueda y el gestor leen siempre Firestore; nunca consultan al Congreso desde el navegador. Una sincronización nueva compara snapshots y crea sugerencias, pero no modifica `quorumLegislators` ni una proyección pública.

Cloud Scheduler invoca diariamente, a las 04:15 de Argentina, `POST /v1/operations/integrations/legislators/sync-due`. El endpoint valida el ID token OIDC, audiencia, correo y verificación de la cuenta de servicio. El job sólo descarga una fuente si `nextScheduledSyncAt` venció; una comprobación exitosa o un `304 Not Modified` programa la próxima a los 90 días. Los fallos se reintentan a las 24 horas, 72 horas y luego cada 7 días.

Variables:

- `CONGRESS_AUTO_SYNC_ENABLED`: interruptor independiente del scheduler.
- `CONGRESS_SYNC_INTERVAL_DAYS=90`: intervalo por ambiente.
- `CONGRESS_SYNC_INVOKER_EMAIL`: identidad exclusiva del job.

Cada fuente usa un lease Firestore de 15 minutos. Los botones “Comprobar ahora” ignoran la fecha futura, pero aprovechan ETag/Last-Modified. “Forzar descarga completa” ignora validadores HTTP, requiere confirmación administrativa y debe reservarse para diagnóstico. El gestor consulta el overview cada 60 segundos sólo mientras la pestaña está visible y también al recuperar foco; no pierde filtros ni selecciones.

La bandeja “Cambios oficiales pendientes” permite comparar el valor local, el snapshot anterior y el nuevo. Aplicar campos crea una revisión inmutable, procedencia y auditoría. Una ficha pública requiere administrador y reconfirmación; una baja oficial sólo puede marcarse revisada y nunca elimina contenido local.

Ante una ejecución en cuarentena:

1. No reintentar en bucle.
2. Revisar el mensaje, metadatos CKAN y snapshot original.
3. Comparar campos y recuentos con el último snapshot válido.
4. Si el portal corrigió el problema, sincronizar nuevamente.
5. Si cambió el esquema legítimamente, adaptar el parser y agregar una fixture de regresión antes de desplegar.

Ante una asociación dudosa, crear un perfil privado nuevo o detener la importación. La similitud de nombres nunca autoriza una fusión automática.

## Promoción a producción

Se requiere:

- cuatro semanas de ejecuciones correctas en staging;
- prueba documentada de cuarentena y recuperación;
- revisión de licencia, atribución y privacidad institucional;
- muestreo manual de al menos 30 legisladores;
- ninguna escritura pública automática comprobada por E2E;
- tablero/alerta para fallas y antigüedad del último snapshot válido;
- plan de desactivación probado.

La promoción empieza en `shadow`, con `congress_auto_sync_enabled.production=false`. Después de observar staging, se activa el job en producción sin habilitar aplicación editorial automática. El modo `assisted` se habilita en una segunda revisión. Para detener sólo la automatización, cambiar `CONGRESS_AUTO_SYNC_ENABLED=false`; para detener también acciones manuales, apagar las tres llaves de importación. Los snapshots, sugerencias, revisiones y datos ya importados permanecen intactos.
