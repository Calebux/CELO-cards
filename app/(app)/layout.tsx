import { headers } from "next/headers";
import { AppProviders } from "../components/AppProviders";

// Every route except the landing page lives under this group. Unlike the
// root layout, this one is NOT pathname-conditional — it always mounts
// AppProviders, so the wallet/wagmi provider tree (and Web3Auth's session
// state) persists across every navigation within the app instead of being
// torn down and rebuilt per page. See "things we need to fix" for why that
// mattered: the previous per-request branching in app/layout.tsx caused
// Web3Auth to re-trigger its mobile redirect flow on every page.
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const ua = requestHeaders.get("user-agent") ?? "";
  const isMiniPayUA = /MiniPay/i.test(ua);

  return <AppProviders isMiniPayUA={isMiniPayUA}>{children}</AppProviders>;
}
