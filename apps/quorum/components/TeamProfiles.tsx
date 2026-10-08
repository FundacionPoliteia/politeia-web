import type { PublicTeamMember, TeamSocialLink } from '@politeia/quorum-contracts';
import PersonPhoto from './PersonPhoto';
import styles from './TeamProfiles.module.css';

const socialLabels: Record<TeamSocialLink['platform'], string> = {
  linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', website: 'Sitio web', other: 'Enlace',
};

export default function TeamProfiles({ members }: { members: PublicTeamMember[] }) {
  return <div className={styles.grid}>{members.map(member => <article className={styles.card} key={member.id} id={`integrante-${member.id}`}>
    <div className={styles.portrait}><PersonPhoto url={member.photoUrl} name={member.fullName} large /><span>Equipo Quórum</span></div>
    <div className={styles.copy}><p className={styles.role}>{member.role}</p><h2>{member.fullName}</h2>
      {(member.organization || member.area) && <p className={styles.organization}>{[member.organization, member.area].filter(Boolean).join(' · ')}</p>}
      {member.bio && <p className={styles.bio}>{member.bio}</p>}
      {member.socialLinks.length > 0 && <nav className={styles.socialLinks} aria-label={`Redes y enlaces de ${member.fullName}`}>{member.socialLinks.map((link, index) => <a href={link.url} key={`${link.platform}-${link.url}-${index}`} target="_blank" rel="noreferrer noopener">{link.label || socialLabels[link.platform]}<span className="material-symbols-outlined" aria-hidden="true">open_in_new</span></a>)}</nav>}
    </div>
  </article>)}</div>;
}
