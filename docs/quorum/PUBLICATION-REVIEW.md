# Comparación editorial antes de publicar

La publicación compara el borrador guardado contra la última revisión publicada
del mismo proyecto, incluso si después se despublicó o se restauró un borrador.
La primera publicación se identifica explícitamente. No se usan timestamps ni
orden de claves JSON para inferir cambios de contenido.

Todos los campos de ProjectInput tienen una sección asignada en
projectChangeFields (verificación exhaustiva de TypeScript). Las listas de
declaraciones, votaciones, cronología, fuentes y documentos se comparan por ID.
Los detalles de votos nominales se comparan por legislador, los bloques por nombre
y las explicaciones por etapa. Se detectan altas, bajas, cambios y reordenamientos.
Los campos opcionales vacíos de versiones anteriores se normalizan.

El modal muestra secciones desplegables con el campo y los valores publicado /
por publicar. Las votaciones, la cronología, las relaciones legislativas, cambios
de etapa y altas/bajas o cambios de postura/texto de declaraciones llevan la señal
“Seguimiento”. Es una clasificación por campo, no una interpretación semántica:
no se afirma que una corrección breve sea irrelevante. Cambiar una opinión o una
votación no habilita notificaciones si la cronología no cambió.

GET /v1/manage/projects/:id/publication-review devuelve las diferencias y un token
SHA-256 del borrador y su revisión base. El modal envía ese token al publicar.
Si cambió el borrador o la revisión base se responde 409 y hay que actualizar
la comparación. El guardado transaccional vuelve a comprobar el borrador para
evitar una carrera entre validación y escritura. Clientes anteriores pueden
publicar sin token, pero el servidor siempre calcula y persiste el informe.

Cada revisión nueva conserva changeReport (versión, secciones, rutas de campos y
clasificación); los valores completos ya están en los snapshots inmutables.
Las revisiones anteriores siguen siendo válidas, sin inventarles un informe.
No se modifica el resumen editorial escrito por la persona.

## Fotos

Las declaraciones y los perfiles admiten photoUrl opcional, vacío para quitarla.
Se aceptan URLs HTTP/HTTPS sin credenciales o carga JPG, PNG, WebP y GIF mediante
el endpoint editorial existente. Los bytes van a Storage y su referencia a
Firestore. El límite del servidor sigue siendo IMAGE_MAX_BYTES (8 MiB por defecto).
No hay migración ni variables nuevas obligatorias.

Los retratos internos usan el proxy autenticado de la web cuando la URL pertenece
al origen configurado de la API. No se abre el acceso privado a los medios.
Los campos de una declaración guardada se bloquean; sólo quedan edición,
reordenamiento y borrado con confirmación. Quitar una declaración es un cambio
del formulario, con deshacer; se persiste al guardar el proyecto.

## Verificación

- npm run quorum:check
- npm run quorum:test
- npm run quorum:e2e -- photos.spec.ts publicationChanges.spec.ts

E2E usa una API aislada en memoria. La respuesta de Storage se simula para probar
éxito y fallo sin subir archivos a producción; los guardados se hacen contra la
API real de prueba. files.test.ts comprueba además la escritura de bytes y
referencias, validación de archivos y conservación ante fallos.
