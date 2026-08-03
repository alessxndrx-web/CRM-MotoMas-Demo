/**
 * SMOKE-POS1.1-A — metadatos del catálogo del punto de venta.
 *
 *   npm run smoke:pos-catalogue
 *
 * Reproduce el cuerpo de las acciones del catálogo, porque autorizan contra la
 * cookie de sesión y no se pueden invocar fuera de una petición. La autorización
 * queda fuera de cobertura, como en el resto de las suites Prisma.
 *
 * Lo que importa comprobar aquí no es que los campos se guarden —eso lo garantiza
 * el esquema— sino tres cosas que sí podrían romperse:
 *
 * 1. **La migración es compatible**: una fila creada con la forma anterior sigue
 *    siendo válida y adquiere valores por defecto inertes.
 * 2. **Nada del catálogo mueve inventario, contabilidad ni caja**, que sigue
 *    siendo la promesa del contexto.
 * 3. **La unicidad anterior sobrevive** a la ampliación.
 *
 * Limpieza guiada por TAG: un fixture a medio construir se borra igual que uno
 * completo.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  isPosProductUnitValue,
  posProductUnitValues,
  sanitizePosStockLevel,
  sanitizePosTaxRate,
} from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS11A-${Date.now()}`;

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${name} ${detail}`);
  }
}

function toMoney(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}
function toLevel(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
}

async function cleanup() {
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.posCategory.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.posBrand.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function main() {
  await cleanup();

  const inventoryBefore = await prisma.inventoryMovement.count();
  const entriesBefore = await prisma.journalEntry.count();
  const postingsBefore = await prisma.postingRecord.count();
  const cashBefore = await prisma.cashDocument.count();
  const salesBefore = await prisma.posSale.count();

  try {
    // --- 1. Compatibilidad de la migración -------------------------------
    console.log("\n1. Compatibilidad con productos anteriores al parche");

    // Exactamente los campos que existían antes de POS1.1-A. Si la migración no
    // fuera aditiva, esto fallaría.
    const legacy = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-LEGACY`,
        name: "Producto anterior",
        unitPrice: toMoney(500),
      },
    });
    check("un producto con la forma anterior sigue siendo creable", !!legacy.id);
    check("descripción por defecto nula", legacy.description === null);
    check("categoría por defecto nula", legacy.categoryId === null);
    check("marca por defecto nula", legacy.brandId === null);
    check("imagen por defecto nula", legacy.imageUrl === null);
    check("unidad por defecto UNIDAD", legacy.unit === "UNIDAD");
    check("costo por defecto 0", Number(legacy.cost) === 0);
    check("tasa por defecto 0", Number(legacy.defaultTaxRate) === 0);
    check("existencia mínima por defecto 0", Number(legacy.minimumStock) === 0);
    check("punto de reposición por defecto 0", Number(legacy.reorderPoint) === 0);
    check("sigue activo por defecto", legacy.isActive === true);
    check(
      "el precio anterior no se tocó",
      Number(legacy.unitPrice) === 500,
      String(legacy.unitPrice),
    );

    // --- 2. Catálogos de apoyo -------------------------------------------
    console.log("\n2. Categorías y marcas");

    const category = await prisma.posCategory.create({
      data: { name: `${TAG} Repuestos` },
    });
    const brand = await prisma.posBrand.create({
      data: { name: `${TAG} Yamaha` },
    });
    check("categoría creada", !!category.id);
    check("marca creada", !!brand.id);
    check("categoría nace activa", category.isActive === true);
    check("marca nace activa", brand.isActive === true);

    let duplicateCategory = false;
    try {
      await prisma.posCategory.create({ data: { name: `${TAG} Repuestos` } });
    } catch {
      duplicateCategory = true;
    }
    check("categoría duplicada rechazada por el índice único", duplicateCategory);

    let duplicateBrand = false;
    try {
      await prisma.posBrand.create({ data: { name: `${TAG} Yamaha` } });
    } catch {
      duplicateBrand = true;
    }
    check("marca duplicada rechazada por el índice único", duplicateBrand);

    // --- 3. Creación con metadatos completos ------------------------------
    console.log("\n3. Creación con metadatos");

    const full = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-FULL`,
        barcode: `${TAG}-BC-FULL`,
        name: "Aceite sintético",
        description: "Aceite 10W40 sintético para motor de cuatro tiempos.",
        categoryId: category.id,
        brandId: brand.id,
        unitPrice: toMoney(320),
        cost: toMoney(210.5),
        unit: "LITRO",
        defaultTaxRate: new Prisma.Decimal("15.00"),
        minimumStock: toLevel(6),
        reorderPoint: toLevel(12.5),
        imageUrl: "https://example.invalid/aceite.png",
      },
      include: { category: true, brand: true },
    });
    check("descripción guardada", full.description?.startsWith("Aceite 10W40") === true);
    check("categoría asignada", full.categoryId === category.id);
    check("categoría resoluble por relación", full.category?.name === category.name);
    check("marca asignada", full.brandId === brand.id);
    check("marca resoluble por relación", full.brand?.name === brand.name);
    check("unidad LITRO guardada", full.unit === "LITRO");
    check("costo guardado", Number(full.cost) === 210.5, String(full.cost));
    check("tasa por defecto guardada", Number(full.defaultTaxRate) === 15);
    check("existencia mínima guardada", Number(full.minimumStock) === 6);
    check(
      "punto de reposición guardado con decimales",
      Number(full.reorderPoint) === 12.5,
      String(full.reorderPoint),
    );
    check("imagen guardada", full.imageUrl === "https://example.invalid/aceite.png");
    check(
      "el punto de reposición puede superar la existencia mínima",
      Number(full.reorderPoint) > Number(full.minimumStock),
    );

    // --- 4. Edición --------------------------------------------------------
    console.log("\n4. Edición");

    const otherCategory = await prisma.posCategory.create({
      data: { name: `${TAG} Lubricantes` },
    });
    const edited = await prisma.posProduct.update({
      where: { id: full.id },
      data: {
        categoryId: otherCategory.id,
        cost: toMoney(230),
        defaultTaxRate: new Prisma.Decimal("0.00"),
        minimumStock: toLevel(10),
        unit: "GALON",
      },
    });
    check("categoría reasignada", edited.categoryId === otherCategory.id);
    check("costo actualizado", Number(edited.cost) === 230);
    check("tasa puesta a cero", Number(edited.defaultTaxRate) === 0);
    check("existencia mínima actualizada", Number(edited.minimumStock) === 10);
    check("unidad cambiada a GALON", edited.unit === "GALON");
    check(
      "el SKU no cambió al editar metadatos",
      edited.sku === `${TAG}-FULL`,
    );

    const unassigned = await prisma.posProduct.update({
      where: { id: full.id },
      data: { categoryId: null, brandId: null },
    });
    check("categoría desasignable", unassigned.categoryId === null);
    check("marca desasignable", unassigned.brandId === null);

    // --- 5. Integridad referencial ----------------------------------------
    console.log("\n5. Integridad referencial");

    await prisma.posProduct.update({
      where: { id: full.id },
      data: { categoryId: category.id },
    });
    let restricted = false;
    try {
      await prisma.posCategory.delete({ where: { id: category.id } });
    } catch {
      restricted = true;
    }
    check(
      "no se puede borrar una categoría en uso (RESTRICT, no SET NULL)",
      restricted,
    );
    const stillThere = await prisma.posProduct.findUniqueOrThrow({
      where: { id: full.id },
    });
    check(
      "el intento fallido no vació la categoría del producto",
      stillThere.categoryId === category.id,
    );

    let badCategory = false;
    try {
      await prisma.posProduct.create({
        data: {
          sku: `${TAG}-BADCAT`,
          name: "Categoría inexistente",
          unitPrice: toMoney(1),
          categoryId: "no-existe",
        },
      });
    } catch {
      badCategory = true;
    }
    check("categoría inexistente rechazada por la clave foránea", badCategory);

    // --- 6. Unicidad preservada -------------------------------------------
    console.log("\n6. La unicidad anterior sobrevive a la ampliación");

    let duplicateSku = false;
    try {
      await prisma.posProduct.create({
        data: { sku: `${TAG}-FULL`, name: "SKU repetido", unitPrice: toMoney(1) },
      });
    } catch {
      duplicateSku = true;
    }
    check("SKU duplicado sigue rechazado", duplicateSku);

    let duplicateBarcode = false;
    try {
      await prisma.posProduct.create({
        data: {
          sku: `${TAG}-OTHER`,
          barcode: `${TAG}-BC-FULL`,
          name: "Código repetido",
          unitPrice: toMoney(1),
        },
      });
    } catch {
      duplicateBarcode = true;
    }
    check("código de barras duplicado sigue rechazado", duplicateBarcode);

    // Dos productos sin código de barras conviven: el índice único ignora NULL.
    const noBarcodeA = await prisma.posProduct.create({
      data: { sku: `${TAG}-NB-A`, name: "Sin código A", unitPrice: toMoney(1) },
    });
    const noBarcodeB = await prisma.posProduct.create({
      data: { sku: `${TAG}-NB-B`, name: "Sin código B", unitPrice: toMoney(1) },
    });
    check(
      "varios productos sin código de barras conviven",
      !!noBarcodeA.id && !!noBarcodeB.id,
    );

    // --- 7. Saneadores ------------------------------------------------------
    console.log("\n7. Saneadores del vocabulario compartido");

    check("tasa 0 aceptada", sanitizePosTaxRate(0) === 0);
    check("tasa 15 aceptada", sanitizePosTaxRate(15) === 15);
    check("tasa 100 aceptada", sanitizePosTaxRate(100) === 100);
    check("tasa 101 rechazada", sanitizePosTaxRate(101) === null);
    check("tasa negativa rechazada", sanitizePosTaxRate(-1) === null);
    check("tasa no finita rechazada", sanitizePosTaxRate(Number.NaN) === null);
    check("tasa redondeada a dos decimales", sanitizePosTaxRate(15.005) === 15.01);

    // Cero es válido en un umbral y no lo es en una cantidad: son cosas
    // distintas, y por eso son dos saneadores.
    check("umbral 0 aceptado", sanitizePosStockLevel(0) === 0);
    check("umbral negativo rechazado", sanitizePosStockLevel(-1) === null);
    check("umbral con tres decimales", sanitizePosStockLevel(2.5) === 2.5);
    check(
      "umbral desmesurado rechazado",
      sanitizePosStockLevel(1_000_000) === null,
    );

    check("UNIDAD reconocida", isPosProductUnitValue("UNIDAD"));
    check("unidad inventada rechazada", !isPosProductUnitValue("BARRIL"));
    check(
      "el vocabulario de unidades coincide con el enum de la base",
      posProductUnitValues.length === 8,
      String(posProductUnitValues.length),
    );

    // Cada valor declarado en TypeScript existe en el enum de PostgreSQL. Si
    // divergieran, esto fallaría al escribir.
    let allUnitsWritable = true;
    for (const unit of posProductUnitValues) {
      try {
        await prisma.posProduct.update({
          where: { id: noBarcodeA.id },
          data: { unit },
        });
      } catch {
        allUnitsWritable = false;
      }
    }
    check(
      "todas las unidades del vocabulario son escribibles en la base",
      allUnitsWritable,
    );

    // --- 8. El catálogo sigue sin tocar nada ------------------------------
    console.log("\n8. Nada de inventario, contabilidad ni caja");

    check(
      "ningún movimiento de inventario",
      (await prisma.inventoryMovement.count()) === inventoryBefore,
    );
    check(
      "ningún asiento contable",
      (await prisma.journalEntry.count()) === entriesBefore,
    );
    check(
      "ninguna contabilización",
      (await prisma.postingRecord.count()) === postingsBefore,
    );
    check(
      "ningún documento de caja",
      (await prisma.cashDocument.count()) === cashBefore,
    );
    check("ninguna venta", (await prisma.posSale.count()) === salesBefore);

    // El catálogo no guarda existencias: no hay ningún campo donde ponerlas.
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pos_products'
    `;
    const names = columns.map((column) => column.column_name);
    check(
      "pos_products no tiene columna de existencias",
      !names.includes("stock") && !names.includes("quantity") &&
        !names.includes("on_hand"),
      names.join(","),
    );
    check(
      "pos_products sí tiene los umbrales, que no son saldos",
      names.includes("minimum_stock") && names.includes("reorder_point"),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.1-A: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
