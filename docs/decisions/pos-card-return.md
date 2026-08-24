# Devolución de una venta sin efectivo — decisión pendiente

**Estado: ABIERTO.** DEV-A implementó la devolución con reembolso en efectivo.
Una venta cobrada **solo con tarjeta o transferencia** sigue sin tener camino, y
`returnPosSaleAction` la rechaza con el código `CARD_ONLY_SALE`.

Este documento existe para que ese hueco no quede como una nota suelta en el
informe de un parche.

---

## 1. Por qué DEV-A la dejó fuera

Devolver una venta con tarjeta exige **devolver dinero por el mismo canal**, y el
mostrador no habla con el banco: **P-42** ya lo dice —el datáfono es un aparato
aparte, el POS no consulta ni recibe autorización—. `TARJETA` en `PosPayment` es
una anotación de cómo se cobró, no una prueba de que se cobró ni un canal por el
que se pueda devolver.

Registrar solo la reposición de existencias bajo la etiqueta «devolución» habría
sido lo que este repositorio evitó durante siete fases: un documento con aspecto
financiero que no mueve dinero.

## 2. Lo que el operador puede hacer hoy

Si la mercancía vuelve y el cobro fue con tarjeta, **el ajuste de inventario ya
existe** (`adjustPosInventoryAction`, desde `/pos/inventario`), con motivo, autor
y bitácora. La pantalla de la venta lo dice con esas palabras.

Lo que no existe —y no se finge— es el movimiento del dinero.

## 3. Las opciones

| Opción | Qué exige | Consecuencia |
|---|---|---|
| **Reembolso en efectivo de una venta con tarjeta** | Nada nuevo en el esquema; solo levantar el tope | El cajón paga un dinero que nunca recibió. El arqueo cuadra en contra. **Descartable salvo decisión explícita del negocio.** |
| **Crédito a favor del cliente** (Opción B del documento hermano) | Representar un saldo del cliente. `ReceivableDocument` existe pero su origen es `CAJA \| CONTABILIDAD` y su autorización es `authorizeFinancialFoundation`, que no acepta sesión de mostrador | Abre la frontera POS ↔ finanzas, que CLAUDE.md separa a propósito |
| **Reverso por el datáfono** | Integración con el adquirente (**P-42**) | Fuera de alcance mientras nadie diga qué adquirente es ni si permite integración |
| **No hacer nada** | — | Es lo actual. El caso se resuelve fuera del sistema y se anota como ajuste |

## 4. Recomendación

**Dejarlo abierto hasta que el negocio diga con qué frecuencia ocurre.** Si un
cliente devuelve un repuesto pagado con tarjeta una vez al mes, el ajuste de
inventario más una nota basta. Si ocurre a diario, la opción realista es el
crédito a favor, y entonces hay que decidir antes quién es dueño del saldo del
cliente y cómo se consume en una venta futura.

## 5. Pregunta a responder

> Cuando un cliente devuelve un repuesto que pagó con tarjeta, ¿qué se le da:
> efectivo del cajón, un saldo a favor, o el cambio del artículo?
