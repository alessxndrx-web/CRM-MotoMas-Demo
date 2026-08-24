export const PENDING_CATALOG_INFO = "Informaci\u00f3n pendiente de completar";

export type PublicMotorcycle = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  shortDescription: string | null;
  description: string | null;
  images: string[];
  colors: string[];
  technicalSpecs: string[];
};

const providedAssetMotorcycles: PublicMotorcycle[] = [
  {
    slug: "boxer-150",
    name: "Boxer 150",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/boxer-150.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "ct-125",
    name: "CT 125",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/ct-125.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-150",
    name: "Pulsar 150",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-150.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-n150",
    name: "Pulsar N150",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-n150.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-n160",
    name: "Pulsar N160",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-n160.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-ns125fi",
    name: "Pulsar NS125FI",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-ns125fi.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-ns125ls",
    name: "Pulsar NS125LS",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-ns125ls.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-ns125ug",
    name: "Pulsar NS125UG",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-ns125ug.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-ns160",
    name: "Pulsar NS160",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-ns160.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
  {
    slug: "pulsar-ns200fi",
    name: "Pulsar NS200FI",
    brand: null,
    category: null,
    shortDescription: null,
    description: null,
    images: ["/catalog/motorcycles/pulsar-ns200fi.jpeg"],
    colors: [],
    technicalSpecs: [],
  },
];

export const motorcycles: PublicMotorcycle[] = [
  {
    slug: "bajaj-pulsar-180",
    name: "Bajaj Pulsar 180",
    brand: "Bajaj",
    category: null,
    shortDescription:
      "Moto con caracter deportivo, excelente desempeño y gran confiabilidad.",
    description:
      "Si buscas una moto con caracter deportivo, excelente desempeño y gran confiabilidad, la Pulsar 180 es la opcion ideal. Equipada con un motor de 178 cc, ofrece una conduccion agil y potente tanto para la ciudad como para carretera.",
    images: ["/catalog/motorcycles/bajaj-pulsar-180.jpeg"],
    colors: [],
    technicalSpecs: [
      "Motor 180 cc de excelente respuesta",
      "Diseño deportivo y agresivo",
      "Frenos de disco para mayor seguridad",
      "Suspension cómoda y estable",
      "Ideal para ciudad y carretera",
      "Excelente economía y rendimiento",
      "Tanque de 15 litros",
    ],
  },
  {
    slug: "bajaj-pulsar-n250-2026",
    name: "Bajaj Pulsar N250 2026",
    brand: "Bajaj",
    category: null,
    shortDescription:
      "Equilibrio entre potencia, tecnologia y diseño deportivo.",
    description:
      "Descubre el equilibrio perfecto entre potencia, tecnologia y diseño deportivo. La Pulsar N250 incorpora un motor de 249 cc, capaz de desarrollar 24.5 HP y 21.5 Nm de torque, brindando una aceleracion contundente y una conduccion suave tanto en ciudad como en carretera.",
    images: ["/catalog/motorcycles/bajaj-pulsar-n250-2026.jpeg"],
    colors: [],
    technicalSpecs: [
      "Motor 249 cc de alto rendimiento",
      "24.5 HP de potencia",
      "21.5 Nm de torque",
      "ABS de doble canal para mayor seguridad",
      "Suspension deportiva y excelente estabilidad",
      "Tablero digital con conectividad Bluetooth y navegacion",
      "Iluminacion Full LED",
      "Tanque de 14 litros",
    ],
  },
  {
    slug: "dominar-250",
    name: "Dominar 250",
    brand: null,
    category: null,
    shortDescription:
      "Motor DOHC de 4 valvulas con refrigeracion liquida y caja de 6 velocidades.",
    description: null,
    images: ["/catalog/motorcycles/dominar-250.jpeg"],
    colors: [],
    technicalSpecs: [
      "Motor DOHC de 4 valvulas con refrigeracion liquida",
      "Potencia maxima: 27 HP a 8,500 rpm",
      "Torque maximo: 23.5 Nm a 6,500 rpm",
      "Caja de 6 velocidades",
      "ABS de doble canal",
      "Suspension delantera invertida USD de 37 mm",
      "Chasis perimetral de doble viga",
      "Iluminacion Full LED",
      "Pantalla LCD digital con indicador de marcha",
      "Tanque de combustible de 13 litros",
      "Peso aproximado de 180 kg",
    ],
  },
  {
    slug: "pulsar-ns200-2027",
    name: "Pulsar NS200 2027",
    brand: null,
    category: null,
    shortDescription:
      "Motor 200cc DTS-i 4 valvulas con potencia real de 24.5 HP.",
    description: null,
    images: ["/catalog/motorcycles/pulsar-ns200-2027.jpeg"],
    colors: [],
    technicalSpecs: [
      "Motor 200cc DTS-i 4 valvulas",
      "Potencia real de 24.5 HP",
      "Caja de 6 velocidades",
      "Version UG1 Upgrade",
      "Suspension delantera invertida y monoshock Nitrox",
      "Doble freno de disco",
      "Refrigeracion liquida",
      "Full LED y tablero digital con conectividad",
      "Consumo eficiente aproximado de 34 km/L",
      "Tanque de 12 litros",
    ],
  },
  {
    slug: "pulsar-ns400z",
    name: "Pulsar NS400Z",
    brand: null,
    category: null,
    shortDescription:
      "Motor 373cc DOHC refrigerado por liquido con hasta 43 HP.",
    description: null,
    images: ["/catalog/motorcycles/pulsar-ns400z.jpeg"],
    colors: [],
    technicalSpecs: [
      "Motor 373cc DOHC refrigerado por liquido",
      "Hasta 43 HP y 35 Nm de torque",
      "Aceleracion 0-100 km/h en aproximadamente 6.4 segundos",
      "Velocidad maxima superior a 150 km/h",
      "Ride by Wire",
      "4 modos de manejo: Road, Rain, Sport y Off-road",
      "Doble freno de disco",
      "ABS doble canal",
      "Control de traccion",
      "Quickshifter",
      "Full LED, proyector y DRL agresivo",
      "Pantalla digital con Bluetooth, navegacion y conectividad",
      "Suspension invertida USD y monoshock Nitrox",
      "Tanque de 12 litros",
    ],
  },
  ...providedAssetMotorcycles,
];

export function getMotorcycleBySlug(slug: string) {
  return motorcycles.find((motorcycle) => motorcycle.slug === slug) ?? null;
}

export function getFeaturedMotorcycles() {
  return motorcycles.slice(0, 3);
}
