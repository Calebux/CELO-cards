import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { headers } from "next/headers";
import "./globals.css";
// Material Icons moved to globals.css as self-hosted @font-face with font-display:swap
// (was: package import that loaded all 5 variants with font-display:block — render-blocking)

// Separate chunks: MiniPay gets wagmi-only bundle, web gets full RainbowKit/WalletConnect bundle
const Providers = dynamic(() => import("./providers").then(m => ({ default: m.Providers })));
const MiniPayProviders = dynamic(() => import("./minipay-providers").then(m => ({ default: m.MiniPayProviders })));

export const metadata: Metadata = {
  title: {
    default: "Action Order — On-Chain Card Fighting Game on Celo",
    template: "%s | Action Order",
  },
  description: "Action Order is an on-chain card fighting game built on Celo. Pick your fighter, arrange your cards, and battle for G$ rewards in ranked matches and tournaments.",
  keywords: ["action order", "celo", "card game", "fighting game", "web3", "blockchain", "gooddollar", "on-chain game"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Action Order",
  },
  openGraph: {
    title: "Action Order — On-Chain Card Fighting Game",
    description: "Pick your fighter, arrange your cards, and battle for G$ rewards on Celo.",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Prevent browser UI from shrinking the viewport when keyboard opens
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ua = (await headers()).get("user-agent") ?? "";
  const isMiniPayUA = /MiniPay/i.test(ua);
  const ProviderComponent = isMiniPayUA ? MiniPayProviders : Providers;

  return (
    <html lang="en" data-minipay={isMiniPayUA ? "1" : undefined}>
      <head>
        {/* Intercept window.electronAPI so wallet extensions that look for
            Electron APIs don't throw and crash the React tree.
            We use defineProperty so the setter fires even after the
            extension overwrites window.electronAPI post-load. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  var _noop=function(){return Promise.resolve('0.0.0');};
  var _val=window.electronAPI||{};
  if(!_val.getAppVersion)_val.getAppVersion=_noop;
  Object.defineProperty(window,'electronAPI',{
    configurable:true,
    get:function(){return _val;},
    set:function(v){if(v&&!v.getAppVersion)v.getAppVersion=_noop;_val=v||{};}
  });
})();` }} />
        {/* Compute viewport scale before first paint so the 1440×823 design
            is visually in position immediately — eliminates the LCP delay
            caused by the React useEffect running after JS parses (~3s mobile) */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){
  try{
    var w=window.innerWidth,h=window.innerHeight,dw=1440,dh=823;
    var s,tx,ty,tr;
    if(h>w){
      s=Math.min(w/dh,h/dw);tx=w/2+(dh*s)/2;ty=h/2-(dw*s)/2;
      tr='translate('+tx+'px,'+ty+'px) rotate(90deg) scale('+s+')';
    }else{
      s=Math.min(w/dw,h/dh);tx=(w-dw*s)/2;ty=(h-dh*s)/2;
      tr='translate('+tx+'px,'+ty+'px) scale('+s+')';
    }
    document.documentElement.style.setProperty('--ao-tr',tr);
  }catch(e){}
})();` }} />
        {/* Service Worker — cache static assets for fast repeat visits */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});}` }} />
        {/* LCP hero — tell the browser to fetch it before layout parses */}
        <link rel="preload" href="/new-assets/landing-hero.webp" as="image" type="image/webp" fetchPriority="high" />
        {/* Warm up Alchemy RPC connection before wagmi makes its first call */}
        <link rel="dns-prefetch" href="https://celo-mainnet.g.alchemy.com" />
        <meta name="talentapp:project_verification" content="c7c221089ad6010ee547afb4beee250212ece55e86edb87f06f96fe73b256fa266df345aaee0c47506d8113e41f681c48f3c3603e08952907365b0a3cacf85f1" />
      </head>
      <body style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}>
        <ProviderComponent>{children}</ProviderComponent>
      </body>
    </html>
  );
}
