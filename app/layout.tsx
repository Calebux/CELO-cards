import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
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
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
        <meta name="talentapp:project_verification" content="c7c221089ad6010ee547afb4beee250212ece55e86edb87f06f96fe73b256fa266df345aaee0c47506d8113e41f681c48f3c3603e08952907365b0a3cacf85f1" />
      </head>
      <body style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
