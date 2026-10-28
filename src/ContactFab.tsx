import { WA_URL } from './contact'

/** Bouton WhatsApp flottant, visible sur tout le site. */
export default function ContactFab() {
  return (
    <a className="wa-fab" href={WA_URL} target="_blank" rel="noopener noreferrer" aria-label="Service client sur WhatsApp">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 4C9.4 4 4 9.3 4 15.9c0 2.3.7 4.5 1.8 6.3L4 28l5.9-1.7a12 12 0 0 0 6.1 1.7c6.6 0 12-5.300 12-11.900S22.600 4 16 4z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M12.200 10.500c-.3 0-.7.100-1 .5-.4.400-1.100 1.100-1.100 2.600 0 1.500 1.100 3 1.300 3.200.2.200 2.200 3.500 5.400 4.800 2.700 1 3.200.8 3.800.8.600-.1 1.900-.8 2.100-1.600.3-.7.300-1.400.2-1.500-.1-.2-.3-.2-.7-.4l-2.100-1c-.3-.1-.5-.2-.7.200l-.9 1.100c-.2.200-.4.200-.7.100-.4-.2-1.500-.6-2.800-1.700-1-.9-1.700-2-1.900-2.400-.2-.3 0-.5.200-.7l.5-.6c.2-.2.200-.4.300-.6.100-.2 0-.4 0-.6l-1-2.300c-.2-.5-.5-.5-.7-.5z" fill="#fff" />
      </svg>
    </a>
  )
}
