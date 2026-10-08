import Script from 'next/script'

/**
 * Google Analytics 4 loader (ANALYTICS_PROVIDER=ga4). Consent Mode defaults
 * every storage type to "denied", so GA4 sends cookieless, aggregate pings
 * only; Google signals and ad personalisation are off. Granting storage needs
 * a consent banner, which is a separate (legal) decision for the store.
 */
export function Ga4Script({ measurementId, nonce }: { measurementId: string; nonce?: string }) {
  const init = [
    'window.dataLayer=window.dataLayer||[];',
    'window.gtag=function(){window.dataLayer.push(arguments)};',
    "gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});",
    "gtag('js',new Date());",
    `gtag('config',${JSON.stringify(measurementId)},{allow_google_signals:false,allow_ad_personalization_signals:false});`,
  ].join('')
  return (
    <>
      <Script id="ga4-init" nonce={nonce} strategy="afterInteractive">
        {init}
      </Script>
      <Script
        id="ga4-gtag"
        nonce={nonce}
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
      />
    </>
  )
}
