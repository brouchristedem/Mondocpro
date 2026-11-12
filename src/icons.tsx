import type { ReactNode } from 'react'

/** Icônes de l'interface : trait 1,8, coins arrondis, héritent la couleur du texte. */
const make = (paths: ReactNode) =>
  function Icon({ size = 18 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {paths}
      </svg>
    )
  }

export const IFolder = make(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
export const IPlus = make(<path d="M12 5v14M5 12h14" />)
export const IPaste = make(<><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9.5 4h5v3h-5zM9.5 12h5M9.5 16h3" /></>)
export const IDownload = make(<path d="M12 4v11M7 11l5 5 5-5M5 20h14" />)
export const ICheck = make(<path d="M5 12.5l4.5 4.5L19 7.5" />)
export const IFile = make(<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h4" />)
export const IHeading = make(<path d="M5 5v14M19 5v14M5 12h14" />)
export const IList = make(<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />)
export const ITable = make(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M3 15h18M9 5v14" /></>)
export const IHash = make(<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" />)
export const ICover = make(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6" /></>)
export const ICloud = make(<path d="M7 18h10a4 4 0 0 0 .5-7.97 5.5 5.5 0 0 0-10.7-1.2A4.6 4.6 0 0 0 7 18z" />)
export const IArrow = make(<path d="M5 12h14M13 6l6 6-6 6" />)
export const IPhone = make(<><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18h2" /></>)
export const IShare = make(<path d="M12 15V4M8 8l4-4 4 4M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />)
export const IDots = make(<path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth="2.6" />)
export const IUser = make(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>)
export const IEye = make(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>)
export const IEdit = make(<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l3 3" />)
export const ISliders = make(<path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6" />)
