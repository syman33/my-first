/** Display a stored E.164 Saudi mobile (+9665XXXXXXXX) in the familiar local form "05X XXX XXXX". */
export function formatSaudiMobile(e164: string): string {
  const match = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164)
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : e164
}
