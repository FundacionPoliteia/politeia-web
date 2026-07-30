import Link from 'next/link';
import { PROJECT_STATUS_CLASSES } from '../lib/publicProjects';
import CardMotionBackdrop from './CardMotionBackdrop';

function ProjectCardContent({ project }) {
  return (
    <>
      <CardMotionBackdrop seed={project.slug} variant="project" />
      <div className="home-project-card__top">
        <span
          className="home-project-card__icon material-symbols-outlined"
          aria-hidden="true"
        >
          {project.modalData.icon}
        </span>
        <span
          className={`badge project-badge ${
            PROJECT_STATUS_CLASSES[project.estado] || ''
          }`}
        >
          {project.estado}
        </span>
      </div>

      <h3>{project.nombre}</h3>
      <p className="project-description">{project.desc}</p>

      <span className="go">
        Conocer el proyecto
        <span className="material-symbols-outlined" aria-hidden="true">
          arrow_forward
        </span>
      </span>
    </>
  );
}

export default function ProjectCard({ project, href, onOpen }) {
  const className =
    'card card-trigger project-card home-project-card motion-card';

  if (href) {
    return (
      <Link
        aria-label={`Conocer el proyecto ${project.nombre}`}
        className={className}
        data-motion-key={project.slug}
        href={href}
      >
        <ProjectCardContent project={project} />
      </Link>
    );
  }

  return (
    <button
      aria-haspopup="dialog"
      className={className}
      data-motion-key={project.slug}
      onClick={() => onOpen?.(project)}
      type="button"
    >
      <ProjectCardContent project={project} />
    </button>
  );
}
