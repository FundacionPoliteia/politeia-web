# Nosotros de Quórum

`/nosotros` muestra integrantes publicados, con nombre, función en Quórum,
organización, área, presentación, foto y orden. Se enlaza desde navbar, footer y
navegación móvil. Reutiliza PhotoField y PersonPhoto, pero no las cuentas del blog,
sus roles ni sus perfiles de autor; tampoco los perfiles de legisladores.

La colección Firestore `quorumTeamMembers` contiene por persona un borrador y una
copia publicada. Guardar cambia sólo el borrador. Publicar copia el borrador;
despublicar retira la copia pública y conserva el borrador. Las actualizaciones
usan una transacción y una versión entera para rechazar conflictos (409).
Los endpoints privados exigen quorum_admin y CSRF; no se incluyen los borradores
en el bootstrap de editores. Crear un perfil no da permisos ni crea cuentas.

El editor conserva el formulario ante errores y permite recargar explícitamente.
Guardar y publicar guarda primero los cambios pendientes y luego publica la
versión confirmada. Las fotos requieren confirmación de subida, como los demás
perfiles. La vista previa usa el mismo componente que la página pública.

Las lecturas públicas y la página usan no-store para no mostrar versiones antiguas
tras publicar o retirar un perfil. No se envían updatedBy ni borradores al público.
Se mantiene la barrera de acceso privado general de staging.

## Despliegue

Requiere backend y frontend nuevos, backend primero. No requiere migración de
datos del blog, variables nuevas, índices compuestos ni recursos Terraform:
Firestore crea la colección en la primera escritura usando la cuenta de servicio
existente. El backup completo de la base incluye también esta colección.

## Pruebas

- `npm run quorum:check`
- `node node_modules/vitest/vitest.mjs run services/quorum-api/src/team.test.ts`
- `npm run quorum:e2e -- team.spec.ts`

Las pruebas de API y navegador usan almacenamiento aislado en memoria; no prueban
la conectividad de un despliegue Firestore real ni modifican integrantes reales.
