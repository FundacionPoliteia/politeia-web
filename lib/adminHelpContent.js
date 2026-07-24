export const HELP_GUIDE_VERSIONS = Object.freeze({
  blogs: 3,
  profile: 1,
  profiles: 1,
  newsletter: 1,
  mailing: 1,
  access: 1,
});

export const ADMIN_HELP_TOPICS = Object.freeze([
  helpTopic('blogs-list', 'blogs', 'Organiza tus notas', 'Busca, filtra y elegi la nota sobre la que queres trabajar.', {
    target: 'blog-list',
    details: 'La lista combina el estado elegido con la busqueda por titulo, categoria o tag. Los autores solo ven sus propias notas; reviewer y admin pueden revisar el conjunto habilitado para su rol.',
    outcome: 'Seleccionar una nota carga su contenido en el editor sin cambiarla ni guardarla.',
  }),
  helpTopic('blogs-metadata', 'blogs', 'Datos principales', 'Titulo, autor, categoria y extracto definen como se presenta la nota.', {
    target: 'blog-metadata',
    details: 'La categoria agrupa notas en una seccion del blog. El extracto tiene su propia ayuda para distinguir el modo automatico del texto escrito manualmente.',
    example: 'Categoria: Relaciones Internacionales.',
  }),
  helpTopic('blogs-excerpt', 'blogs', 'Extracto automatico o manual', 'El extracto resume la nota en cards, busquedas y enlaces compartidos.', {
    target: 'blog-excerpt',
    introducedIn: 3,
    details: 'En modo automatico cambia a medida que redactas o importas contenido. En cuanto escribis dentro del campo pasa a manual y conserva exactamente tu version.',
    outcome: 'Volver a automatico descarta el texto manual y vuelve a generar el resumen desde el contenido.',
  }),
  helpTopic('blogs-author', 'blogs', 'Autoria de la nota', 'El nombre define la firma visible y permite relacionar la nota con un perfil de autor.', {
    target: 'blog-author',
    details: 'Podes escribir otro nombre cuando la nota pertenezca realmente a otra persona y tu flujo de trabajo lo permita. Para mostrar su foto, pagina publica y cierre, el nombre debe coincidir con el perfil del autor. Cambiarlo no transfiere la propiedad interna de la nota ni la cuenta que la creo.',
    outcome: 'Si el autor todavia no tiene cuenta, un administrador puede crear un perfil gestionado y vincularlo mas adelante.',
    example: 'Usa siempre la misma forma del nombre: Juan Cruz Galarza, no Juan Galarza en una nota y J. C. Galarza en otra.',
  }),
  helpTopic('blogs-tags', 'blogs', 'Tags y busqueda', 'Los tags describen temas puntuales y ayudan a encontrar notas relacionadas.', {
    target: 'blog-tags',
    details: 'Escribi un tema y usa coma o Enter para convertirlo en un tag. Se usan en la busqueda del panel y del blog, y pueden mostrarse como filtros o etiquetas visuales. No crean secciones principales: eso corresponde a la categoria.',
    outcome: 'Podes quitar cada chip por separado. El sistema normaliza y evita tags equivalentes repetidos.',
    example: 'Categoria: Relaciones Internacionales. Tags: comercio, integracion, Mercosur.',
  }),
  helpTopic('blogs-cover', 'blogs', 'Portada de la nota', 'Podes usar una URL o subir una imagen y decidir si aparece dentro del articulo.', {
    target: 'blog-cover',
    details: 'La portada se usa en cards, enlaces compartidos y avisos por correo. Se admiten JPEG, PNG, WebP, AVIF y GIF de hasta 5 MB. Espera a que termine la carga antes de guardar o cambiar de imagen.',
    outcome: 'Si la carga falla, conserva el archivo original y volve a intentarlo desde el mismo control.',
  }),
  helpTopic('blogs-editor', 'blogs', 'Editor de contenido', 'Da formato al articulo, agrega enlaces, imagenes y tablas desde la barra superior.', {
    target: 'blog-editor',
    details: 'El contenido se guarda junto con la nota. Las imagenes internas admiten JPEG, PNG, WebP, AVIF y GIF de hasta 5 MB. Las marcas de comentarios solo aparecen en el panel de revision y nunca se publican en el blog.',
    outcome: 'Guardar conserva el avance; no envia la nota a revision ni la publica.',
  }),
  helpTopic('blogs-references', 'blogs', 'Bibliografia y referencias', 'Registra las fuentes usadas en la nota con un texto y un enlace opcional.', {
    target: 'blog-references',
    introducedIn: 3,
    details: 'Cada fila representa una fuente. Podes reordenarlas antes de publicar; los enlaces deben usar HTTPS y las filas vacias no se guardan.',
    outcome: 'Las referencias se muestran como una lista numerada despues del articulo y antes del cierre de autor.',
    example: 'Informe anual de participacion ciudadana / https://ejemplo.org/informe',
  }),
  helpTopic('blogs-comments', 'blogs', 'Comentarios de revision', 'Los comentarios permiten conversar sobre una porcion concreta del texto.', {
    target: 'blog-comments',
    details: 'Selecciona texto para crear un comentario. Las respuestas forman un hilo y resolverlo no elimina su historial. Una card abre el hilo y enfoca el fragmento relacionado.',
    outcome: 'Responder, resolver o reabrir puede generar una notificacion para la otra parte.',
  }),
  helpTopic('blogs-author-end', 'blogs', 'Cierre de autor', 'Podes terminar la nota con la identidad del autor y una frase breve.', {
    target: 'blog-author-end',
    details: 'El nombre y la foto provienen del perfil que coincide con el autor. La frase puede usar el valor guardado en ese perfil o reemplazarse solo para esta nota.',
    outcome: 'Si no existe un perfil coincidente, el cierre puede mostrar unicamente el nombre disponible.',
  }),
  helpTopic('blogs-workflow', 'blogs', 'Flujo editorial', 'Cada accion mueve la nota a una etapa distinta; revisa la vista previa antes de continuar.', {
    target: 'blog-workflow',
    roles: ['reviewer', 'admin'],
    details: 'Guardar conserva cambios. Enviar a revision avisa al equipo revisor. Publicar vuelve visible la version aprobada. Archivar la retira del flujo editorial sin eliminarla.',
    outcome: 'Una nota publicada que recibe permiso de edicion sigue visible mientras se prepara y revisa su nueva version.',
  }),
  helpTopic('blogs-workflow-author', 'blogs', 'Tu paso en el flujo editorial', 'Guarda tu trabajo y envialo cuando este listo para que el equipo lo revise.', {
    target: 'blog-workflow',
    roles: ['blog'],
    excludeRoles: ['reviewer', 'admin'],
    details: 'Guardar conserva tus cambios. Enviar a revision entrega la nota al equipo revisor y bloquea la edicion mientras se evalua. Publicar y archivar son decisiones del equipo revisor; no necesitas realizarlas desde tu cuenta.',
    outcome: 'Si una nota publicada necesita cambios, solicita edicion. La version visible se mantiene mientras preparas la nueva version.',
  }),
  helpTopic('blogs-advanced', 'blogs', 'URL y fecha de publicacion', 'Estas opciones permiten conservar la direccion y la fecha editorial de una nota.', {
    target: 'blog-advanced',
    roles: ['reviewer', 'admin'],
    details: 'Cambia el slug solo antes de compartir la nota o cuando exista una razon editorial clara. La fecha de publicacion sirve para migrar notas antiguas y determina su fecha visible y su posicion cronologica en el blog.',
    outcome: 'Si la fecha queda vacia se usa el momento de publicacion. Solo se aceptan hoy o fechas anteriores; este campo no programa publicaciones futuras.',
  }),
  helpTopic('profile-identity', 'profile', 'Tu identidad en el panel', 'Estos datos firman comentarios y completan la autoria de nuevas notas.', {
    target: 'profile-identity',
    details: 'Nombre, apellido y foto identifican tu trabajo dentro del panel. Sobre mi presenta tu mirada en el directorio de autores y la frase de cierre puede aparecer al final de tus notas.',
  }),
  helpTopic('profile-public', 'profile', 'Perfil publico', 'Vos decidis si tu informacion de autor puede mostrarse a los lectores.', {
    target: 'profile-public',
    details: 'El perfil solo puede publicarse cuando el nombre coincide con la autoria de una nota. Antes de guardar se muestra una confirmacion con los datos que quedaran visibles.',
    outcome: 'Podes retirar el consentimiento en cualquier momento y guardar nuevamente.',
  }),
  helpTopic('profile-claim', 'profile', 'Vincular una autoria', 'Solicita un perfil existente cuando fue creado antes de que tuvieras cuenta.', {
    target: 'profile-claim',
    details: 'La vinculacion requiere coincidencia exacta de nombre y aprobacion administrativa. Al aprobarse, heredas el perfil y las notas asociadas sin cambiar autores historicos de comentarios.',
  }),
  helpTopic('profile-email', 'profile', 'Avisos del flujo', 'Elegi que movimientos internos tambien queres recibir por correo.', {
    target: 'profile-email',
    details: 'Las notificaciones dentro del panel siguen activas. Esta preferencia solo controla los emails y puede configurarse por tipo de evento.',
  }),
  helpTopic('profile-logs', 'profile', 'Logs y diagnostico', 'Los administradores pueden revisar solicitudes y entregas de correo.', {
    target: 'profile-logs',
    roles: ['admin'],
    guide: false,
    details: 'Los errores 4xx suelen indicar datos o permisos; los 5xx indican una falla del servicio. El request ID permite ubicar la misma operacion en Cloud Run.',
  }),
  helpTopic('profiles-claims', 'profiles', 'Solicitudes de vinculacion', 'Revisa quien pide heredar un perfil gestionado y sus notas.', {
    target: 'profiles-claims',
    roles: ['admin'],
    details: 'Aprobar transfiere el perfil y la propiedad editorial. Bloquear impide nuevas solicitudes de esa cuenta hasta que un administrador la desbloquee.',
    outcome: 'Confirma siempre el email, el nombre y la cantidad de notas antes de aprobar.',
  }),
  helpTopic('profiles-manager', 'profiles', 'Gestion de autores', 'Crea o corrige perfiles de autores que todavia no tienen una cuenta propia.', {
    target: 'profiles-manager',
    roles: ['admin'],
    details: 'El nombre debe coincidir con el autor escrito en las notas. Los perfiles gestionados pueden editarse o eliminarse mientras no tengan solicitudes pendientes.',
  }),
  helpTopic('newsletter-subscribers', 'newsletter', 'Suscriptores', 'Consulta quienes confirmaron su suscripcion y quienes todavia estan pendientes.', {
    target: 'newsletter-subscribers',
    details: 'Solo los confirmados reciben campanas. Las preferencias de novedades y nuevos blogs se respetan en cada envio.',
  }),
  helpTopic('newsletter-templates', 'newsletter', 'Plantillas y borradores', 'Carga una estructura reutilizable o guarda la campana actual como plantilla.', {
    target: 'newsletter-templates',
    details: 'Cargar una plantilla reemplaza los campos actuales despues de una confirmacion. Un borrador queda en el proveedor; una plantilla queda disponible en este panel.',
  }),
  helpTopic('newsletter-editor', 'newsletter', 'Contenido del newsletter', 'Arma el correo con el editor visual y revisa el resultado final antes de enviarlo.', {
    target: 'newsletter-editor',
    details: 'Imagenes y enlaces deben usar direcciones publicas. La vista previa reproduce el HTML que recibiran los suscriptores, con los estilos y el enlace de baja incluidos.',
  }),
  helpTopic('newsletter-send', 'newsletter', 'Prueba y envio', 'La prueba llega a un solo email; el envio real usa el segmento confirmado.', {
    target: 'newsletter-send',
    details: 'Ambas acciones abren una previsualizacion. El envio real solo se ejecuta despues de la confirmacion final y no puede deshacerse desde el panel.',
  }),
  helpTopic('mailing-settings', 'mailing', 'Reglas automaticas', 'Configura frecuencia, limites y textos de los avisos de nuevas notas.', {
    target: 'mailing-settings',
    roles: ['admin'],
    details: 'Los cambios del formulario no se aplican hasta guardar. Restaurar valores predeterminados solo modifica el formulario para que puedas revisarlo antes de confirmar.',
  }),
  helpTopic('mailing-lab', 'mailing', 'Laboratorio de pruebas', 'Previsualiza correos individuales o apilados sin consumir cupos.', {
    target: 'mailing-lab',
    roles: ['admin'],
    details: 'Las pruebas usan las notas seleccionadas y el email indicado. No cambian la cola ni marcan publicaciones como enviadas.',
  }),
  helpTopic('mailing-queue', 'mailing', 'Cola inteligente', 'Controla que notas esperan envio, fueron excluidas o necesitan reintento.', {
    target: 'mailing-queue',
    roles: ['admin'],
    details: 'Enviar ahora evita la espera y puede superar el limite semanal. Usa esa accion solo despues de previsualizar el grupo seleccionado.',
  }),
  helpTopic('access-roles', 'access', 'Roles y permisos', 'Los roles determinan que pestañas y acciones puede usar cada cuenta.', {
    target: 'access-roles',
    roles: ['admin'],
    details: 'Admin hereda reviewer, blog y newsletter. Reviewer hereda las capacidades de blog. Quitar todos los roles revoca el acceso operativo en la siguiente validacion de sesion.',
    outcome: 'Guardar notifica al usuario sobre el cambio, segun sus preferencias.',
  }),
  helpTopic('notifications-inbox', 'notifications', 'Actividad del panel', 'Las notificaciones guardan cambios editoriales y acciones que requieren tu atencion.', {
    details: 'Abrir una notificacion la marca como leida y te lleva al post, comentario, perfil o permiso relacionado. Las leidas antiguas se agrupan en Anteriores y se eliminan al vencer la retencion.',
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
