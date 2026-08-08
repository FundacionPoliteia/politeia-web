# Glosario contextual

## Modelo y migración

Cada término conserva la definición completa y agrega `shortDefinition`, `aliases`, `inlineEnabled` y `updatedBy`. Los alias son explícitos: el sistema no inventa plurales ni sinónimos. Términos y alias se normalizan sin mayúsculas, tildes ni espacios repetidos y no pueden colisionar con otra entrada.

Antes de habilitar el marcado contextual sobre una base existente, ejecutar una vez:

```powershell
npm run quorum:migrate:glossary-inline
```

La migración es idempotente. Conserva todos los términos, propone como definición breve la primera oración, crea `aliases: []` y deja `inlineEnabled=false`. No publicará ningún disparador hasta que un editor revise y active cada entrada. En producción puede definirse `MIGRATION_ACTOR_EMAIL` para la auditoría.

## Reglas de marcado

Sólo se procesan resumen, impacto y cuerpo de cada actualización cronológica. El componente recibe con la ficha los términos publicados que el proyecto tiene asociados, por lo que hover, foco y tap no disparan solicitudes de red.

- Las frases largas ganan sobre las cortas.
- Se marca la primera aparición de cada término por sección.
- La comparación ignora mayúsculas y tildes, preservando el texto original.
- Se exigen límites Unicode de palabra: `ley` no coincide dentro de `leyenda`.
- No se procesan títulos, nombres, expedientes, enlaces ni controles.
- No se usa HTML inyectado; el texto se divide en nodos React deterministas.

En desktop, hover o foco abre la tarjeta y click/Enter/Espacio la fija. En pantallas táctiles, un tap abre una hoja inferior con enlace a la definición completa. Escape, cierre o click exterior restauran el estado y el foco. Los estilos usan tokens de superficie, texto, borde, foco y acento para ser compatibles con los temas claro y oscuro.

## Publicación y rollback

Actualizar un término invalida el caché público. Al leer una ficha, la API reemplaza el snapshot embebido por la versión canónica publicada según `glossaryTermIds`; un borrador o término despublicado nunca llega al cliente.

Para retirar un disparador sin eliminar su ficha, desactivar `inlineEnabled`. Para retirarlo sólo de un proyecto, quitar su asociación y volver a publicar el proyecto. Ninguna de las dos operaciones borra el historial editorial.
