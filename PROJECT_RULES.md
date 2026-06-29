# MotoMas — Reglas del proyecto

## 1. Qué es MotoMas

MotoMas es una plataforma ERP + CRM desarrollada para una empresa distribuidora de motocicletas con operación multi-sucursal.

La empresa maneja aproximadamente 12 sucursales. La mayoría están ubicadas en Managua, aunque también existen puntos fuera de la ciudad, como Masaya, Ciudad Sandino y El Coyotepe.

MotoMas debe centralizar la información comercial y operativa de todas las sucursales dentro de una única plataforma.

La idea no es crear una aplicación genérica. El sistema debe reflejar la forma real en que trabaja la empresa:

- La empresa recibe leads desde Facebook Ads, Instagram Ads, TikTok, WhatsApp, referidos y sitio web.
- Los leads deben llegar a la sucursal elegida por el prospecto.
- El gerente o supervisor debe asignarlos manualmente.
- Un cliente puede cotizar en varias sucursales y con varios vendedores.
- Las motocicletas se trasladan frecuentemente entre sucursales.
- Los créditos se gestionan con financieras externas y su estado se actualiza manualmente.
- Cada movimiento importante debe quedar registrado.

MotoMas debe sentirse como una herramienta creada específicamente para concesionarios y distribuidoras de motocicletas.

---

## 2. Cómo debe presentarse el sistema

La presentación recomendada es:

**MotoMas — Plataforma ERP + CRM Multi-Sucursal para concesionarios de motocicletas**

También puede usarse:

**MotoMas — Centro de Operaciones Comerciales**

El sistema puede describirse como una plataforma integral de gestión comercial y operativa.

No debe presentarse únicamente como “CRM”, porque el alcance incluye inventario, traslados, unidades, ventas, trazabilidad y control multi-sucursal.

---

## 3. Qué debe centralizar MotoMas

MotoMas debe organizar y relacionar:

- Leads
- Prospectos
- Clientes
- Vendedores
- Gerentes
- Administradores
- Sucursales
- Cotizaciones
- Expedientes
- Créditos
- Financieras
- Reservas
- Motocicletas
- Inventario por sucursal
- Unidades individuales
- Traslados
- Ventas
- Historial de actividad
- Reportes

La plataforma debe permitir operar tanto desde una sucursal específica como desde una vista corporativa.

---

## 4. Qué NO es MotoMas

MotoMas no debe convertirse en:

- Una tienda ecommerce tradicional.
- Un marketplace.
- Una plantilla administrativa genérica.
- Un CRM genérico sin lógica de sucursales.
- Un ERP contable o financiero completo.
- Una aplicación bancaria.
- Una integración automática con financieras en la primera versión.

Puede existir un catálogo público, pero el sistema no debe sentirse como una tienda online convencional.

El objetivo principal no es vender directamente desde una página web. El objetivo es centralizar y ordenar la operación comercial.

---

## 5. Regla principal del negocio

> Los clientes pertenecen a MotoMas, no a los vendedores.

Los vendedores administran relaciones comerciales, pero la información pertenece a la empresa.

Esto implica:

- Los leads permanecen en el sistema.
- Los clientes permanecen en el sistema.
- Los expedientes permanecen en el sistema.
- Las cotizaciones permanecen en el sistema.
- El historial permanece en el sistema.
- Los créditos permanecen en el sistema.
- Las ventas permanecen en el sistema.

Si un vendedor renuncia, cambia de sucursal o deja de atender una cartera, el gerente puede reasignar leads y clientes sin perder información.

---

## 6. Base de datos única y centralizada

Todas las sucursales deben trabajar sobre una sola base de datos.

No deben existir bases separadas por sucursal.

Cada registro debe incluir la sucursal relacionada cuando corresponda.

Ejemplos:

- Un lead tiene una sucursal deseada.
- Una cotización registra sucursal y vendedor.
- Una venta registra sucursal.
- Una motocicleta tiene una sucursal actual.
- Un traslado tiene sucursal origen y sucursal destino.
- Un gerente ve su sucursal.
- Un administrador puede ver toda la operación.

La base de datos central permite continuidad, trazabilidad y reportes corporativos.

---

## 7. Sucursales

MotoMas debe estar preparado para manejar aproximadamente 12 sucursales.

Ejemplos confirmados:

- Plaza Inter
- Rubenia
- Carretera Norte
- Ciudad Sandino
- Masaya
- El Coyotepe

Cada sucursal tendrá:

- Inventario propio
- Vendedores propios
- Ventas propias
- Metas propias
- Leads recibidos
- Traslados enviados
- Traslados recibidos
- Reportes de sucursal

La ciudad no debe utilizarse para asignar leads automáticamente, porque varias sucursales pueden encontrarse dentro de Managua.

---

## 8. Separación obligatoria entre experiencias

MotoMas tiene dos experiencias distintas.

### Portal Cliente

Es una experiencia pública para prospectos y clientes.

Debe permitir:

- Ver catálogo.
- Ver motocicletas.
- Solicitar información.
- Elegir sucursal de atención.
- Consultar expediente.
- Consultar estado de crédito.
- Consultar reserva.
- Consultar entrega.

No debe mostrar:

- Login operativo.
- Vendedores como usuarios del sistema.
- Menús administrativos.
- Reportes.
- Inventario operativo interno.
- Utilidades.
- Configuración.
- Información privada de otras personas.

El Portal Cliente debe parecer un sitio orientado al cliente final.

### Centro de Operaciones

Es una experiencia privada para el equipo interno.

Debe incluir únicamente:

- Vendedor
- Gerente
- Administrador

Debe existir bajo rutas privadas como `/panel/*`.

No se debe mostrar el rol Cliente dentro del login operativo.

El Centro de Operaciones debe parecer una plataforma empresarial interna.

---

## 9. Leads

Los leads pueden ingresar desde:

- Facebook Ads
- Instagram Ads
- TikTok
- WhatsApp
- Referidos
- Sitio web

El formulario público debe solicitar:

- Nombre
- Teléfono
- Correo opcional
- Motocicleta de interés
- Sucursal donde desea ser atendido

Regla:

> El lead no se asigna automáticamente a un vendedor.

Primero entra a la bandeja de leads de la sucursal seleccionada.

Después, un gerente o supervisor lo asigna manualmente.

---

## 10. Clientes multi-sucursal

Un cliente debe existir una sola vez en la base de datos.

No debe quedar bloqueado a:

- Una sola sucursal.
- Un solo vendedor.

Un cliente puede cotizar en varias sucursales y con distintos vendedores.

Ejemplo:

**Juan Pérez**

- Roberto — Plaza Inter — Pulsar NS200
- María — Ciudad Sandino — Boxer
- José — Masaya — Dominar

El sistema debe conservar todas las interacciones.

La venta no debe bloquearse por el hecho de que otro vendedor haya atendido al mismo cliente anteriormente.

---

## 11. Créditos

Los créditos se gestionan con financieras externas.

No se implementarán integraciones bancarias ni APIs financieras en la primera versión.

El seguimiento se actualiza manualmente desde el expediente.

### Regla de la demo actual

Cada expediente conserva un solo seguimiento de crédito activo. La financiera
puede editarse durante el proceso, pero no se registran múltiples solicitudes
simultáneas por financiera en esta fase.

Una fase futura podrá soportar varias aplicaciones por expediente cuando exista
persistencia centralizada, historial de decisiones y autorización real.

Estados mínimos:

- En evaluación
- Documentación pendiente
- Aprobado
- Rechazado

Cada actualización debe registrar:

- Financiera
- Estado
- Fecha
- Observación
- Usuario que actualizó
- Historial

El seguimiento manual no reserva una unidad, no crea una venta y no representa
una aprobación financiera automática.

---

## 12. Inventario por sucursal

El inventario no debe mostrarse solamente como un total general.

Debe mostrar la distribución por sucursal.

Ejemplo:

**Pulsar NS200**

- Plaza Inter: 20
- Rubenia: 12
- Ciudad Sandino: 8
- Total: 40

Debe existir:

- Vista consolidada corporativa.
- Vista por sucursal.
- Vista por modelo.
- Vista por unidad individual.

---

## 13. Trazabilidad por unidad

MotoMas debe estar preparado para manejar cada motocicleta individualmente.

Cada unidad puede incluir:

- VIN
- Número de chasis
- Número de motor
- Modelo
- Color
- Sucursal actual
- Estado
- Historial de movimientos

Estados mínimos:

- Disponible
- Reservada
- Vendida
- En tránsito
- Entregada

El objetivo es responder con claridad:

- ¿Dónde se encuentra esta moto?
- ¿Está disponible?
- ¿Está reservada?
- ¿Se encuentra en tránsito?
- ¿Ya fue vendida?
- ¿A qué sucursal pertenece actualmente?

---

## 14. Traslados entre sucursales

Los traslados son un módulo crítico.

Las sucursales trasladan motocicletas constantemente.

El sistema debe registrar:

- Sucursal origen
- Sucursal destino
- Unidad o unidades
- Solicitante
- Responsable de aprobación
- Fecha de solicitud
- Fecha de aprobación
- Fecha de despacho
- Fecha de recepción
- Estado
- Observaciones
- Historial

Estados:

- Pendiente
- Aprobado
- En tránsito
- Recibido
- Cancelado

Al confirmar recepción:

- La unidad deja de estar disponible en la sucursal origen.
- La unidad ingresa a la sucursal destino.
- Se actualiza su sucursal actual.
- Se registra el historial.
- Se conserva trazabilidad.

---

## 15. Reportes

Los vendedores no deben ver reportes corporativos.

El acceso debe quedar así:

### Vendedor
Puede ver información necesaria para atender su trabajo diario.

No puede ver:

- Reportes corporativos.
- Utilidades.
- Métricas sensibles de toda la empresa.
- Gestión de usuarios.
- Configuración global.

### Gerente
Puede ver reportes de su sucursal.

### Administrador
Puede ver reportes globales y comparar sucursales.

---

## 16. Diseño visual que se debe mantener

El diseño visual ya fue definido y validado conceptualmente.

Estilo:

- Premium
- Oscuro
- Tecnológico
- Empresarial
- Moderno
- Hecho a medida

Colores base:

- Fondo: `#170A12`
- Tarjetas: `#25111B`
- Rojo principal: `#E11D2E`
- Texto principal: `#F8FAFC`
- Texto secundario: `#94A3B8`

Referencias visuales:

- Tesla
- Stripe
- Linear
- Notion
- Salesforce Automotive

Regla importante:

> No rediseñar el sistema como una plantilla genérica. Seguir guiándose por las referencias visuales existentes del proyecto.

---

## 17. Datos reales de motocicletas

La información de motos debe provenir de carpetas y archivos proporcionados para el proyecto.

No inventar:

- Nombres
- Modelos
- Versiones
- Colores
- Fotografías
- Especificaciones técnicas
- Precios

Si falta un dato, mostrar:

`Información pendiente de completar`

No reemplazar información faltante con contenido inventado.

---

## 18. Alcance de la demo

La demo debe ser funcional y navegable.

Debe demostrar:

- Separación entre Portal Cliente y Centro de Operaciones.
- Catálogo público.
- Formulario de solicitud de información.
- Creación de lead.
- Bandeja de leads.
- Asignación manual.
- Gestión de cliente.
- Cotización.
- Expediente.
- Crédito.
- Reserva.
- Inventario por sucursal.
- Traslado.
- Venta.
- Consulta de entrega para cliente.

La demo puede usar:

- Datos simulados.
- `localStorage`.
- Roles demo.
- Navegación funcional.
- Estados editables.

No necesita:

- Autenticación compleja.
- Backend completo.
- Integraciones bancarias.
- Facturación.
- Pagos reales.

---

## 19. Lenguaje recomendado para presentar MotoMas

Evitar términos como:

- Problema
- Pérdida
- Error
- Deficiencia

Usar:

- Centralización
- Gestión
- Integración
- Seguimiento
- Visibilidad
- Continuidad
- Productividad
- Trazabilidad
- Control operativo

El mensaje central es:

> MotoMas centraliza la operación comercial y el inventario de múltiples sucursales, conserva la propiedad corporativa de los clientes y permite dar seguimiento a cada oportunidad, crédito, reserva, traslado y venta.
