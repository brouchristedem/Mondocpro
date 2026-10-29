import { PHONE_SHOW, TEL_URL, WA_URL } from './contact'

/** « À propos » : qui est derrière mondocpro. Texte court et vrai, sans chiffres inventés. */
export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="À propos" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        <img className="about-photo" src="/edem.jpg" width="400" height="400" alt="Christ Edem" loading="lazy" />
        <h2>Christ Edem</h2>
        <p>Étudiant en Licence 3 Logistique à Abidjan. Je crée des outils web simples pour les étudiants en Côte d’Ivoire.</p>
        <p>mondocpro met en page ton texte (page de garde, sommaire, pagination, tableaux) et te donne un Word prêt à rendre. Sans compte, ton texte reste sur ton appareil.</p>
        <a className="btn" href={WA_URL} target="_blank" rel="noopener noreferrer">Écrire sur WhatsApp</a>
        <a className="btn ghost" href={TEL_URL}>Appeler {PHONE_SHOW}</a>
        <p className="tiny"><a href="https://christedem.vercel.app" target="_blank" rel="noopener noreferrer">Mon portfolio</a> · Un site Edem Digital Group</p>
      </div>
    </div>
  )
}
