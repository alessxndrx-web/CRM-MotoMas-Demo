# Roles comerciales: Vendedor y Líder de ventas

**Patch CRM-QA1.** Qué es el Líder de ventas, por qué es un rol y no otra cosa, y
la matriz completa de lo que cada rol puede hacer en el CRM.

---

## 1. Qué es un Líder de ventas

**Un vendedor con supervisión sobre el equipo de su sucursal.** No es un tipo de
empleado distinto:

- misma tabla `users`, misma contraseña, misma sesión firmada, misma sucursal;
- conserva **todo** lo que un vendedor hace: leads, clientes, expedientes,
  actividades, reservas, traslados;
- añade supervisión: asignar, revisar y **reportar la venta**.

## 2. Por qué es un valor del enumerado `UserRole`

Es la abstracción de RBAC que este repositorio ya tiene. `docs/ROLE_EXPANSION_PLAN.md`
lo diseñó así en el parche 4.0A y documentó la regla de las dos representaciones:

    prisma UserRole  ←→  UserRoleEnum (servidor)  ←→  OperationRole (interfaz)

Añadir un rol obliga a tocar **las dos** uniones y **los dos** mapas puente, y
`tsc` falla hasta que todos los `Record<OperationRole, …>` exhaustivos están
completos. Esa es una propiedad de seguridad deseable, no un estorbo: un rol
nuevo no puede quedarse a medias sin que el build lo diga.

**Las alternativas y por qué no.** Un segundo sistema de usuarios habría
duplicado la autenticación (el prompt lo prohíbe explícitamente y el repositorio
ya paga ese precio con `PosOperator`, que existe por una razón que aquí no
aplica). Una bandera booleana en `User` —al estilo de `PosOperator.canManagePurchases`—
habría dejado la navegación, el alcance y los textos por rol sin forma de
distinguirlo, porque todo eso se resuelve sobre `OperationRole`.

## 3. Lo que el Líder añade sobre un Vendedor

| Predicado | Qué desbloquea |
|---|---|
| `canAssignLeads` | Repartir leads del equipo |
| `canAssignCustomers` | Repartir la cartera de clientes |
| `canRegisterSales` | **Reportar la venta** |
| `canReviewExpedienteDocuments` | Aprobar/rechazar documentos del checklist |
| `canReviewReservationPaymentProofs` | Verificar comprobantes de pago |
| `canManagePaymentRequests` | Solicitar cobros al cliente |
| `canViewSellerPerformance` | Ver el desempeño de su equipo |
| `getCrmScopeForUser` | Alcance de **sucursal** en vez de personal |

## 4. Lo que NO añade

Caja, Contabilidad, Marketing, Soporte, gestión de usuarios, movimientos de
inventario, configuración del sistema y **costos**. Supervisar a un equipo no es
razón para ver lo que la empresa pagó por una unidad: `canViewCosts` sigue siendo
Admin, Contador y Gerente.

## 5. La regla que motivó todo esto

> **Sólo el Líder de ventas reporta la venta. Un vendedor normal, no.**

Dos predicados separados, porque la regla separa exactamente ahí:

- **`canManageSales`** — entrar al módulo, ver las ventas del alcance, marcar
  una entrega. Un Vendedor **sí**.
- **`canRegisterSales`** — el acto de cierre que marca la unidad como vendida y
  consume la reserva. Un Vendedor **no**.

Un vendedor sigue pudiendo figurar como **vendedor responsable** de una venta
(`Sale.sellerId`): trabajó el lead, el expediente y la reserva. Lo que no ejecuta
es el cierre.

**La comprobación vive en `createSale`**, no en el botón. Un vendedor que llame a
la acción directamente recibe el mismo rechazo que si no hubiera pantalla. El
smoke `npm run smoke:crm-qa` lo verifica sin pasar por la interfaz.

---

## 6. Matriz de permisos del CRM

`✓` permitido · `—` denegado · `(p)` sólo sus propios registros ·
`(s)` toda su sucursal · `(g)` global

| Acción | Vendedor | Líder de ventas | Gerente | Admin | Cliente |
|---|:--:|:--:|:--:|:--:|:--:|
| Entrar a Leads | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Registrar lead a mano | ✓ | ✓ | ✓ | ✓ | — |
| Asignar lead a un vendedor | — | ✓ | ✓ | ✓ | — |
| Cambiar estado de un lead | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Asociar la moto de interés | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Registrar actividad | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Registrar cliente | ✓ | ✓ | ✓ | ✓ | — |
| **Asignar/reasignar cliente** | — | ✓ | ✓ | ✓ | — |
| Crear expediente | ✓ | ✓ | ✓ | ✓ | — |
| Adjuntar documento al expediente | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Aprobar/rechazar documento | — | ✓ | ✓ | ✓ | — |
| Crear/editar solicitud de crédito | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Lista de créditos de la sucursal | — | ✓ | ✓ | ✓ | — |
| Crear reserva | ✓ | ✓ | ✓ | ✓ | — |
| Subir comprobante de reserva | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| **Aprobar/rechazar comprobante** | — | ✓ | ✓ | ✓ | — |
| Cancelar reserva | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| **Reportar venta** | **—** | **✓** | ✓ | ✓ | — |
| Ver ventas | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Marcar entrega | ✓ (p) | ✓ (s) | ✓ (s) | ✓ (g) | — |
| **Solicitar cobro al cliente** | — | ✓ | ✓ | ✓ | — |
| Anular cobro | — | ✓ (s) | ✓ (s) | ✓ (g) | — |
| Ver/pagar sus propios cobros | — | — | — | — | ✓ |
| Ver los cobros de otro cliente | — | — | — | — | **—** |
| Proveedores | — | — | ✓ (s) | ✓ (g) | — |
| Órdenes de compra | — | — | ✓ (s) | ✓ (g) | — |
| Ver costos | — | **—** | ✓ (s) | ✓ (g) | — |
| Caja / Contabilidad | — | — | según rol | ✓ | — |
| Crear usuarios | — | — | ✓ (Vendedor, Líder) | ✓ (todos) | — |

El **Contador** conserva todo lo suyo y gana `canManageSuppliers`: un proveedor
es un tercero contable y siempre fue suyo. El **Cajero**, **Marketing** y
**Soporte Técnico** no cambian en nada con este parche.

---

## 7. Cómo se crea un Líder de ventas

`/panel/configuracion` → alta de usuario. Un **Gerente** puede crear Vendedor y
Líder de ventas de su propia sucursal; un **Administrador**, cualquier rol en
cualquier sucursal.

No hay que migrar a nadie: un vendedor existente se promueve cambiándole el rol,
y conserva sus leads, sus clientes y sus expedientes porque todos apuntan a su
`userId`, no a su rol.

En desarrollo sin base de datos hay una identidad de prueba,
`lider@motomas.local`, con la contraseña de desarrollo documentada en `ROLES.md`.
