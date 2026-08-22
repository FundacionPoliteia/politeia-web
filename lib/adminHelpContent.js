export const HELP_GUIDE_VERSIONS = Object.freeze({
  blogs: 3,
  profile: 1,
  profiles: 1,
  newsletter: 1,
  mailing: 1,
  access: 1,
});

export const ADMIN_HELP_TOPICS = Object.freeze([
  helpTopic('blogs-list', 'blogs', 'Organizá tus notas', 'Buscá, filtrá y elegí la nota sobre la que querés trabajar.', {
    target: 'blog-list',
    details: 'La lista combina el estado elegido con la búsqueda por título, categoría o tag. Los autores solo ven sus propias notas; reviewer y admin pueden revisar el conjunto habilitado para su rol.',
    outcome: 'Seleccionar una nota carga su contenido en el editor sin cambiarla ni guardarla.',
  }),
  helpTopic('blogs-metadata', 'blogs', 'Datos principales', 'Título, autor, categoría y extracto definen cómo se presenta la nota.', {
    target: 'blog-metadata',
    details: 'La categoría agrupa notas en una sección del blog. El extracto tiene su propia ayuda para distinguir el modo automático del texto escrito manualmente.',
    example: 'Categoría: Relaciones Internacionales.',
  }),
  helpTopic('blogs-excerpt', 'blogs', 'Extracto automático o manual', 'El extracto resume la nota en cards, búsquedas y enlaces compartidos.', {
    target: 'blog-excerpt',
    introducedIn: 3,
    details: 'En modo automático cambia a medida que redactás o importás contenido. En cuanto escribís dentro del campo pasa a manual y conserva exactamente tu versión.',
    outcome: 'Volver a automático descarta el texto manual y vuelve a generar el resumen desde el contenido.',
  }),
  helpTopic('blogs-author', 'blogs', 'Autoría de la nota', 'El nombre define la firma visible y permite relacionar la nota con un perfil de autor.', {
    target: 'blog-author',
    details: 'Podés escribir otro nombre cuando la nota pertenezca realmente a otra persona y tu flujo de trabajo lo permita. Para mostrar su foto, página pública y cierre, el nombre debe coincidir con el perfil del autor. Cambiarlo no transfiere la propiedad interna de la nota ni la cuenta que la creó.',
    outcome: 'Si el autor todavía no tiene cuenta, un administrador puede crear un perfil gestionado y vincularlo más adelante.',
    example: 'Usá siempre la misma forma del nombre: Juan Cruz Galarza, no Juan Galarza en una nota y J. C. Galarza en otra.',
  }),
  helpTopic('blogs-tags', 'blogs', 'Tags y búsqueda', 'Los tags describen temas puntuales y ayudan a encontrar notas relacionadas.', {
    target: 'blog-tags',
    details: 'Escribí un tema y usá coma o Enter para convertirlo en un tag. Se usan en la búsqueda del panel y del blog, y pueden mostrarse como filtros o etiquetas visuales. No crean secciones principales: eso corresponde a la categoría.',
    outcome: 'Podés quitar cada chip por separado. El sistema normaliza y evita tags equivalentes repetidos.',
    example: 'Categoría: Relaciones Internacionales. Tags: comercio, integración, Mercosur.',
  }),
  helpTopic('blogs-cover', 'blogs', 'Portada de la nota', 'Podés usar una URL o subir una imagen y decidir si aparece dentro del artículo.', {
    target: 'blog-cover',
    details: 'La portada se usa en cards, enlaces compartidos y avisos por correo. Se admiten JPEG, PNG, WebP, AVIF y GIF de hasta 5 MB. Esperá a que termine la carga antes de guardar o cambiar de imagen.',
    outcome: 'Si la carga falla, conservá el archivo original y volvé a intentarlo desde el mismo control.',
  }),
  helpTopic('blogs-editor', 'blogs', 'Editor de contenido', 'Dale formato al artículo, agregá enlaces, imágenes y tablas desde la barra superior.', {
    target: 'blog-editor',
    details: 'El contenido se guarda junto con la nota. Las imágenes internas admiten JPEG, PNG, WebP, AVIF y GIF de hasta 5 MB. Las marcas de comentarios solo aparecen en el panel de revisión y nunca se publican en el blog.',
    outcome: 'Guardar conserva el avance; no envía la nota a revisión ni la publica.',
  }),
  helpTopic('blogs-references', 'blogs', 'Bibliografía y referencias', 'Registrá las fuentes usadas en la nota con un texto y un enlace opcional.', {
    target: 'blog-references',
    introducedIn: 3,
    details: 'Cada fila representa una fuente. Podés reordenarlas antes de publicar; los enlaces deben usar HTTPS y las filas vacías no se guardan.',
    outcome: 'Las referencias se muestran como una lista numerada después del artículo y antes del cierre de autor.',
    example: 'Informe anual de participación ciudadana / https://ejemplo.org/informe',
  }),
  helpTopic('blogs-comments', 'blogs', 'Comentarios de revisión', 'Los comentarios permiten conversar sobre una porción concreta del texto.', {
    target: 'blog-comments',
    details: 'Seleccioná texto para crear un comentario. Las respuestas forman un hilo y resolverlo no elimina su historial. Una card abre el hilo y enfoca el fragmento relacionado.',
    outcome: 'Responder, resolver o reabrir puede generar una notificación para la otra parte.',
  }),
  helpTopic('blogs-author-end', 'blogs', 'Cierre de autor', 'Podés terminar la nota con la identidad del autor y una frase breve.', {
    target: 'blog-author-end',
    details: 'El nombre y la foto provienen del perfil que coincide con el autor. La frase puede usar el valor guardado en ese perfil o reemplazarse solo para esta nota.',
    outcome: 'Si no existe un perfil coincidente, el cierre puede mostrar únicamente el nombre disponible.',
  }),
  helpTopic('blogs-workflow', 'blogs', 'Flujo editorial', 'Cada acción mueve la nota a una etapa distinta; revisá la vista previa antes de continuar.', {
    target: 'blog-workflow',
    roles: ['reviewer', 'admin'],
    details: 'Guardar conserva cambios. Enviar a revisión permite asignar una persona concreta o avisar al equipo completo. Publicar vuelve visible la versión aprobada. Archivar la retira del flujo editorial sin eliminarla.',
    outcome: 'Una nota publicada que recibe permiso de edición sigue visible mientras se prepara y revisa su nueva versión.',
  }),
  helpTopic('blogs-workflow-author', 'blogs', 'Tu paso en el flujo editorial', 'Guardá tu trabajo y envialo cuando esté listo para que el equipo lo revise.', {
    target: 'blog-workflow',
    roles: ['blog'],
    excludeRoles: ['reviewer', 'admin'],
    details: 'Guardar conserva tus cambios. Enviar a revisión permite elegir una persona responsable o dejar la nota para todo el equipo, y bloquea la edición mientras se evalúa. Publicar y archivar son decisiones del equipo revisor; no necesitás realizarlas desde tu cuenta.',
    outcome: 'Si una nota publicada necesita cambios, solicitá edición. La versión visible se mantiene mientras preparás la nueva versión.',
  }),
  helpTopic('blogs-advanced', 'blogs', 'URL y fecha de publicación', 'Estas opciones permiten conservar la dirección y la fecha editorial de una nota.', {
    target: 'blog-advanced',
    roles: ['reviewer', 'admin'],
    details: 'Cambiá el slug solo antes de compartir la nota o cuando exista una razón editorial clara. La fecha de publicación sirve para migrar notas antiguas y determina su fecha visible y su posición cronológica en el blog.',
    outcome: 'Si la fecha queda vacía se usa el momento de publicación. Solo se aceptan hoy o fechas anteriores; este campo no programa publicaciones futuras.',
  }),
  helpTopic('profile-identity', 'profile', 'Tu identidad en el panel', 'Estos datos firman comentarios y completan la autoría de nuevas notas.', {
    target: 'profile-identity',
    details: 'Nombre, apellido y foto identifican tu trabajo dentro del panel. Sobre mí presenta tu mirada en el directorio de autores y la frase de cierre puede aparecer al final de tus notas.',
  }),
  helpTopic('profile-public', 'profile', 'Perfil público', 'Vos decidís si tu información de autor puede mostrarse a los lectores.', {
    target: 'profile-public',
    details: 'El perfil solo puede publicarse cuando el nombre coincide con la autoría de una nota. Antes de guardar se muestra una confirmación con los datos que quedarán visibles.',
    outcome: 'Podés retirar el consentimiento en cualquier momento y guardar nuevamente.',
  }),
  helpTopic('profile-review-assignment', 'profile', 'Asignaciones de revisión', 'Los admin pueden decidir si quieren aparecer como responsables disponibles.', {
    target: 'profile-review-assignment',
    roles: ['admin'],
    details: 'Los reviewer aparecen siempre en la lista de asignación. Esta preferencia solo controla si tu cuenta admin puede ser elegida individualmente al enviar una nota a revisión.',
    outcome: 'Es una preferencia interna: no modifica tus permisos ni publica información adicional en el blog.',
  }),
  helpTopic('profile-claim', 'profile', 'Vincular una autoría', 'Solicitá un perfil existente cuando fue creado antes de que tuvieras cuenta.', {
    target: 'profile-claim',
    details: 'La vinculación requiere coincidencia exacta de nombre y aprobación administrativa. Al aprobarse, heredás el perfil y las notas asociadas sin cambiar autores históricos de comentarios.',
  }),
  helpTopic('profile-email', 'profile', 'Avisos del flujo', 'Elegí qué movimientos internos también querés recibir por correo.', {
    target: 'profile-email',
    details: 'Las notificaciones dentro del panel siguen activas. Esta preferencia solo controla los emails y puede configurarse por tipo de evento.',
  }),
  helpTopic('profile-logs', 'profile', 'Logs y diagnóstico', 'Los administradores pueden revisar solicitudes y entregas de correo.', {
    target: 'profile-logs',
    roles: ['admin'],
    guide: false,
    details: 'Los errores 4xx suelen indicar datos o permisos; los 5xx indican una falla del servicio. El request ID permite ubicar la misma operación en Cloud Run.',
  }),
  helpTopic('profiles-claims', 'profiles', 'Solicitudes de vinculación', 'Revisá quién pide heredar un perfil gestionado y sus notas.', {
    target: 'profiles-claims',
    roles: ['admin'],
    details: 'Aprobar transfiere el perfil y la propiedad editorial. Bloquear impide nuevas solicitudes de esa cuenta hasta que un administrador la desbloquee.',
    outcome: 'Confirmá siempre el email, el nombre y la cantidad de notas antes de aprobar.',
  }),
  helpTopic('profiles-manager', 'profiles', 'Gestión de autores', 'Creá o corregí perfiles de autores que todavía no tienen una cuenta propia.', {
    target: 'profiles-manager',
    roles: ['admin'],
    details: 'El nombre debe coincidir con el autor escrito en las notas. Los perfiles gestionados pueden editarse o eliminarse mientras no tengan solicitudes pendientes.',
  }),
  helpTopic('newsletter-subscribers', 'newsletter', 'Suscriptores', 'Consultá quiénes confirmaron su suscripción y quiénes todavía están pendientes.', {
    target: 'newsletter-subscribers',
    details: 'Solo los confirmados reciben campañas. Las preferencias de novedades y nuevos blogs se respetan en cada envío.',
  }),
  helpTopic('newsletter-templates', 'newsletter', 'Plantillas y borradores', 'Cargá una estructura reutilizable o guardá la campaña actual como plantilla.', {
    target: 'newsletter-templates',
    details: 'Cargar una plantilla reemplaza los campos actuales después de una confirmación. Un borrador queda en el proveedor; una plantilla queda disponible en este panel.',
  }),
  helpTopic('newsletter-editor', 'newsletter', 'Contenido del newsletter', 'Armá el correo con el editor visual y revisá el resultado final antes de enviarlo.', {
    target: 'newsletter-editor',
    details: 'Imágenes y enlaces deben usar direcciones públicas. La vista previa reproduce el HTML que recibirán los suscriptores, con los estilos y el enlace de baja incluidos.',
  }),
  helpTopic('newsletter-send', 'newsletter', 'Prueba y envío', 'La prueba llega a un solo email; el envío real usa el segmento confirmado.', {
    target: 'newsletter-send',
    details: 'Ambas acciones abren una previsualización. El envío real solo se ejecuta después de la confirmación final y no puede deshacerse desde el panel.',
  }),
  helpTopic('mailing-settings', 'mailing', 'Reglas automáticas', 'Configurá frecuencia, límites y textos de los avisos de nuevas notas.', {
    target: 'mailing-settings',
    roles: ['admin'],
    details: 'Los cambios del formulario no se aplican hasta guardar. Restaurar valores predeterminados solo modifica el formulario para que puedas revisarlo antes de confirmar.',
  }),
  helpTopic('mailing-lab', 'mailing', 'Laboratorio de pruebas', 'Previsualiza correos individuales o apilados sin consumir cupos.', {
    target: 'mailing-lab',
    roles: ['admin'],
    details: 'Las pruebas usan las notas seleccionadas y el email indicado. No cambian la cola ni marcan publicaciones como enviadas.',
  }),
  helpTopic('mailing-queue', 'mailing', 'Cola inteligente', 'Controlá qué notas esperan envío, fueron excluidas o necesitan reintento.', {
    target: 'mailing-queue',
    roles: ['admin'],
    details: 'Enviar ahora evita la espera y puede superar el límite semanal. Usá esa acción solo después de previsualizar el grupo seleccionado.',
  }),
  helpTopic('access-roles', 'access', 'Roles y permisos', 'Los roles determinan qué pestañas y acciones puede usar cada cuenta.', {
    target: 'access-roles',
    roles: ['admin'],
    details: 'Admin hereda reviewer, blog y newsletter. Reviewer hereda las capacidades de blog. Quitar todos los roles revoca el acceso operativo en la siguiente validación de sesión.',
    outcome: 'Guardar notifica al usuario sobre el cambio, según sus preferencias.',
  }),
  helpTopic('notifications-inbox', 'notifications', 'Actividad del panel', 'Las notificaciones guardan cambios editoriales y acciones que requieren tu atención.', {
    details: 'Abrir una notificación la marca como leída y te lleva al post, comentario, perfil o permiso relacionado. Las leídas antiguas se agrupan en Anteriores y se eliminan al vencer la retención.',
  }),
]);

export function getAdminHelpTopics(area, roles = []) {
  const cleanRoles = Array.isArray(roles) ? roles : [];
  return ADMIN_HELP_TOPICS.filter((topic) => topic.area === area
    && topic.guide !== false
    && (!topic.roles.length || topic.roles.some((role) => cleanRoles.includes(role)))
    && !topic.excludeRoles.some((role) => cleanRoles.includes(role)));
}

export function getAdminHelpTopic(id, roles = []) {
  const topic = ADMIN_HELP_TOPICS.find((item) => item.id === id);
  if (!topic) return null;
  if (topic.roles.length && !topic.roles.some((role) => roles.includes(role))) return null;
  if (topic.excludeRoles.some((role) => roles.includes(role))) return null;
  return topic;
}

function helpTopic(id, area, title, summary, options = {}) {
  return Object.freeze({
    id,
    area,
    title,
    summary,
    version: HELP_GUIDE_VERSIONS[area] || 1,
    target: options.target || '',
    details: options.details || summary,
    outcome: options.outcome || '',
    example: options.example || '',
    guide: options.guide !== false,
    introducedIn: Number(options.introducedIn) || 1,
    roles: Object.freeze(options.roles || []),
    excludeRoles: Object.freeze(options.excludeRoles || []),
  });
}
