import type { PublicTeamMember } from '@politeia/quorum-contracts';
import PersonPhoto from './PersonPhoto';
import styles from './TeamProfiles.module.css';

export default function TeamProfiles({ members }: { members: PublicTeamMember[] }) {
  return <div className={styles.grid}>{members.map(member => <article className={styles.card} key={member.id} id={`integrante-${member.id}`}>
    <div className={styles.portrait}><PersonPhoto url={member.photoUrl} name={member.fullName} large /><span>Equipo Quórum</span></div>
    <div className={styles.copy}><p className={styles.role}>{member.role}</p><h2>{member.fullName}</h2>
      {(member.organization || member.area) && <p className={styles.organization}>{[member.organization, member.area].filter(Boolean).join(' · ')}</p>}
      {member.bio && <p className={styles.bio}>{member.bio}</p>}
    </div>
  </article>)}</div>;
}
