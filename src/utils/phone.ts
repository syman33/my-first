/** Display a stored E.164 Saudi mobile (+9665XXXXXXXX) in the familiar local form "05X XXX XXXX". */
export function formatSaudiMobile(e164: string): string {
  const match = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164)
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : e164
}

/** Click-to-chat link for an E.164 number (+9665XXXXXXXX → https://wa.me/9665XXXXXXXX). */
export function whatsappHref(e164: string): string | null {
  const match = /^\+([1-9]\d{7,14})$/.exec(e164)
  return match ? `https://wa.me/${match[1]}` : null
}
