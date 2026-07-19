import { HotelDemoCheckout } from "./hotel-demo-checkout";

export default async function HotelDemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <HotelDemoCheckout params={await searchParams} />;
}
