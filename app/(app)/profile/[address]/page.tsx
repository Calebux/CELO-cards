import { Metadata } from "next";
import PublicProfileClient from "./PublicProfileClient";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return {
    title: `${short} — Action Order Player Profile`,
    description: `View ${short}'s stats, achievements, and ranking in Action Order.`,
    openGraph: {
      title: `${short} — Action Order`,
      description: `Action Order player profile for ${short}`,
      images: [{ url: "/og-profile.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${short} — Action Order`,
      description: `Check out my Action Order stats!`,
      images: ["/og-profile.png"],
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { address } = await params;
  return <PublicProfileClient address={address} />;
}
