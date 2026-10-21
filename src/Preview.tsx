import { useEffect, useRef } from 'react'
import { renderAsync } from 'docx-preview'

export default function Preview({ blob }: { blob: Blob | null }) {
  const host = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!blob || !host.current) return
    renderAsync(blob, host.current, undefined, { className: 'dp', breakPages: true, useBase64URL: true })
  }, [blob])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => { if (host.current) (host.current.style as CSSStyleDeclaration & { zoom: string }).zoom = String(Math.min(1, el.clientWidth / 860)) }
    const ro = new ResizeObserver(fit)
    ro.observe(el); fit()
    return () => ro.disconnect()
  }, [])

  return <div className="preview" ref={box}><div ref={host} id="print-area" /></div>
}
