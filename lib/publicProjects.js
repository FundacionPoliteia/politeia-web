export const PUBLIC_PROJECTS = [
  {
    slug: 'coyuntura',
    nombre: 'Coyuntura',
    estado: 'Activo',
    desc: 'Informamos y acercamos la política a la ciudadanía de manera dinámica e interactiva.',
    modalData: {
      eyebrow: 'Información y análisis político',
      icon: 'campaign',
      title: 'Coyuntura',
      intro:
        'Informamos y acercamos la política a la ciudadanía de manera dinámica e interactiva.',
      sections: [
        {
          icon: 'analytics',
          title: 'Análisis político',
          body:
            'Proponemos un espacio de reflexión e interpretación de la coyuntura a través de la elaboración de notas de opinión.',
        },
        {
          icon: 'newspaper',
          title: 'Cobertura',
          body:
            'Informamos sobre las principales noticias de la política nacional, manteniendo un tono neutral y orientado a la claridad informativa.',
        },
      ],
      participants: [
        { name: 'Denise Chmois', image: '/equipo/denise.png', role: 'Coordinadora' },
        { name: 'Rosario Inurrigarro', image: '/equipo/rosario.png', role: 'Coordinadora' },
        { name: 'Lourdes Ramos', image: '/equipo/lourdes.png', role: 'Coordinadora' },
      ],
    },
  },
  {
    slug: 'globeia',
    nombre: 'Globeia',
    estado: 'Activo',
    desc: 'Democratizamos el conocimiento producido en el campo de las Relaciones Internacionales.',
    modalData: {
      eyebrow: 'Relaciones Internacionales',
      icon: 'public',
      title: 'Globeia',
      intro:
        'Difundimos, democratizamos e impulsamos el conocimiento producido en el campo de las Relaciones Internacionales.',
      sections: [
        {
          icon: 'target',
          title: '¿Qué buscamos?',
          items: [
            'Ampliar el acceso al conocimiento producido en el campo de las Relaciones Internacionales.',
            'Traducir conceptos teóricos a un lenguaje accesible sin perder rigurosidad.',
            'Visibilizar aportes individuales de jóvenes investigadores e investigadoras.',
            'Generar un insumo concreto y útil para la toma de decisiones en política exterior.',
            'Crear una red de acción entre participantes que impulse su colaboración en diversos ámbitos de las Relaciones Internacionales mediante Politeia.',
          ],
        },
      ],
      participants: [
        { name: 'Paula Pochettino', image: '/equipo/pochetino.jpg', role: 'Coordinadora' },
        { name: 'Camila Turner', image: '/equipo/camila.png', role: 'Coordinadora' },
      ],
    },
  },
  {
    slug: 'quorum',
    nombre: 'Quórum',
    estado: 'En desarrollo',
    desc: 'Una web app para conocer candidaturas y comprender el accionar legislativo en lenguaje claro.',
    modalData: {
      eyebrow: 'Web app',
      icon: 'account_balance',
      title: 'Quórum',
      intro:
        'Informamos a la ciudadanía sobre los candidatos electorales y el accionar del Congreso Nacional y las legislaturas provinciales.',
      sections: [
        {
          icon: 'how_to_vote',
          title: 'En años electorales',
          body:
            'Busca acercar a la ciudadanía las propuestas políticas de los principales candidatos de cada partido, provincia y jurisdicción que disputan cargos electivos.',
        },
        {
          icon: 'gavel',
          title: 'En años no electorales',
          body:
            'Busca simplificar el debate legislativo para el ciudadano común mediante herramientas analíticas y estéticas, desde un aporte apartidario.',
        },
      ],
      participants: [
        { name: 'Valentina Díaz', image: '/equipo/valentina.png', role: 'Coordinadora' },
        { name: 'Guadalupe Perez', image: '/equipo/guadalupe.png', role: 'Coordinadora' },
      ],
    },
  },
  {
    slug: 'politez',
    nombre: 'PoliteZ',
    estado: 'Activo',
    desc: 'Una propuesta pedagógica y política impulsada por jóvenes para jóvenes.',
    modalData: {
      eyebrow: 'Educación democrática',
      icon: 'school',
      title: 'PoliteZ',
      intro:
        'A través de charlas en escuelas, PoliteZ busca acercar a los estudiantes a su primera experiencia democrática.',
      sections: [
        {
          icon: 'forum',
          title: 'La importancia de la política',
          body:
            'Un primer acercamiento al valor de la participación y al rol que ocupa la política en la vida cotidiana.',
        },
        {
          icon: 'ballot',
          title: 'El sistema electoral argentino',
          body:
            'Una explicación accesible de las instituciones, los procesos electorales y las distintas instancias de representación.',
        },
        {
          icon: 'history_edu',
          title: 'Historia del sufragio',
          body:
            'Un recorrido por la ampliación de los derechos políticos y la evolución del voto en Argentina.',
        },
      ],
      participants: [
        { name: 'Sofía Walker', image: '/equipo/walker.png', role: 'Coordinadora' },
      ],
    },
  },
];

export const PROJECT_STATUS_CLASSES = {
  Activo: 'badge-active',
  'En desarrollo': 'badge-development',
  Publicación: 'badge-publication',
};
