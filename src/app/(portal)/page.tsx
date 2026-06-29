import { motorcycles } from "@/data/catalog/motorcycles";
import { MotomasShowroomCarousel } from "@/features/portal/components/motomas-showroom-carousel";

export default function PortalHomePage() {
  return motorcycles.length ? <MotomasShowroomCarousel motorcycles={motorcycles} /> : null;
}
