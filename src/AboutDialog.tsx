import { PHONE_SHOW, TEL_URL, WA_URL } from './contact'
import { useDialog } from './useDialog'

/** « À propos » : qui est derrière mondocpro. Texte court et vrai, sans chiffres inventés. */
export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const ref = useDialog(onClose)
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-label="À propos" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        <img className="about-photo" src="/edem.jpg" width="400" height="400" alt="Christ Edem" loading="lazy" />
        <h2>Christ Edem</h2>
        <p>Développeur web basé à Abidjan et étudiant en Licence 3 Logistique. Je conçois des outils numériques simples et fiables pour les étudiants et les professionnels de Côte d’Ivoire.</p>
        <p>mondocpro met en forme vos documents académiques : page de garde, sommaire, pagination et tableaux. Vous obtenez un fichier Word propre, prêt à être remis. Aucun compte n’est requis : votre texte reste sur votre appareil.</p>
        <a className="btn" href={WA_URL} target="_blank" rel="noopener noreferrer">Écrire sur WhatsApp</a>
        <a className="btn ghost" href={TEL_URL}>Appeler {PHONE_SHOW}</a>
        <p className="tiny"><a href="https://portfolio-christedem.vercel.app" target="_blank" rel="noopener noreferrer">Mon portfolio</a> · Un site Edem Digital Group</p>
      </div>
    </div>
  )
}
