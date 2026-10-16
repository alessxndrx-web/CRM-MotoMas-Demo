import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, type UserRole } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";

const db=new PrismaClient();
const tag=`E2E-CRMCC1-${Date.now()}`;
const password="Temporary-CRMCC1-test-password";
const branchIds:string[]=[];
const userIds:string[]=[];
const users:Partial<Record<UserRole,{id:string;email:string}>>={};
let branchA:{id:string;code:string;name:string};
let branchB:{id:string;code:string;name:string};
let customerBId="",fileId="",leadBId="",customerAId="",staffBId="";
const chassis=`${tag}-CH`;

async function login(page:Page,role:UserRole){
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(users[role]!.email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button",{name:/ingresar|entrar|acceder/i}).click();
  await page.waitForURL(/\/panel/,{timeout:120000});
}

test.beforeAll(async()=>{
  branchA=await db.branch.create({data:{code:`${tag}-a`,name:`${tag}-Sucursal A`}});branchIds.push(branchA.id);
  branchB=await db.branch.create({data:{code:`${tag}-b`,name:`${tag}-Sucursal B`}});branchIds.push(branchB.id);
  for(const role of ["ADMIN","GERENTE","LIDER_VENTAS","CALL_CENTER","VENDEDOR","MARKETING"] as const){
    const user=await db.user.create({data:{name:`${tag}-${role}`,email:`${tag}-${role}@smoke.local`.toLowerCase(),passwordHash:hashPassword(password),role,branchId:role==="ADMIN"?null:branchA.id}});
    users[role]=user;userIds.push(user.id);
  }
  const staffB=await db.user.create({data:{name:`${tag}-Vendedor B`,email:`${tag}-staffB@smoke.local`.toLowerCase(),passwordHash:hashPassword(password),role:"VENDEDOR",branchId:branchB.id}});staffBId=staffB.id;userIds.push(staffB.id);
  const customer=await db.customer.create({data:{name:`${tag}-Cliente B`,phone:"82224001",phoneNormalized:"82224001",branchId:branchB.id,assignedSellerId:users.CALL_CENTER!.id}});customerBId=customer.id;
  const customerA=await db.customer.create({data:{name:`${tag}-Cliente A`,phone:"82224002",phoneNormalized:"82224002",branchId:branchA.id}});customerAId=customerA.id;
  const lead=await db.lead.create({data:{trackingCode:`${tag}-SOL`,name:`${tag}-Lead B`,phone:"82224003",branchId:branchB.id,assignedSellerId:users.CALL_CENTER!.id}});leadBId=lead.id;
  const file=await db.customerFile.create({data:{fileNumber:`${tag}-EXP`,customerId:customer.id,branchId:branchB.id,sellerId:users.CALL_CENTER!.id,motorcycleInterest:"Boxer 150X"}});fileId=file.id;
  await db.creditApplication.create({data:{customerFileId:file.id,branchId:branchB.id,customerId:customer.id,pendingItems:"Constancia de prueba pendiente"}});
  await db.activity.create({data:{type:"LLAMADA",branchId:branchB.id,userId:users.CALL_CENTER!.id,leadId:lead.id,description:`${tag}-Seguimiento`,scheduledAt:new Date(Date.now()-60000)}});
  await db.activity.createMany({data:[
    {type:"SEGUIMIENTO",branchId:branchB.id,userId:users.CALL_CENTER!.id,customerId:customer.id,description:`${tag}-Cliente directo`},
    {type:"SEGUIMIENTO",branchId:branchB.id,userId:users.CALL_CENTER!.id,customerFileId:file.id,description:`${tag}-Solo expediente`},
    {type:"SEGUIMIENTO",branchId:branchB.id,userId:users.CALL_CENTER!.id,description:`${tag}-Sin contacto`},
    {type:"SEGUIMIENTO",branchId:branchA.id,userId:users.GERENTE!.id,description:`${tag}-General A`},
  ]});
});

test.afterAll(async()=>{
  const createdUsers=await db.user.findMany({where:{email:{startsWith:`${tag}-created-`.toLowerCase()}},select:{id:true}});
  userIds.push(...createdUsers.map(user=>user.id));
  await db.userNotification.deleteMany({where:{userId:{in:userIds}}});
  await db.activity.deleteMany({where:{branchId:{in:branchIds}}});
  await db.creditApplication.deleteMany({where:{branchId:{in:branchIds}}});
  await db.customerFile.deleteMany({where:{id:fileId}});
  await db.lead.deleteMany({where:{id:leadBId}});
  await db.customer.deleteMany({where:{id:{in:[customerAId,customerBId]}}});
  await db.inventoryMovement.deleteMany({where:{branchId:{in:branchIds}}});
  await db.motorcycleUnit.deleteMany({where:{branchId:{in:branchIds}}});
  await db.userPermissionGrant.deleteMany({where:{userId:{in:userIds}}});
  await db.userAuditLog.deleteMany({where:{actorUserId:{in:userIds}}});
  await db.user.deleteMany({where:{id:{in:userIds}}});
  await db.branch.deleteMany({where:{id:{in:branchIds}}});
  await db.$disconnect();
});

test("Administrador crea Call Center con sucursal y la cuenta inicia sesión con acceso comercial global",async({page})=>{
  await login(page,"ADMIN");
  await page.goto("/panel/configuracion");
  const form=page.locator("form").filter({has:page.getByRole("button",{name:"Crear usuario",exact:true})});
  await form.getByRole("combobox",{name:/^Rol/i}).selectOption("CALL_CENTER");
  await expect(form.getByRole("combobox",{name:/^Sucursal/i})).toBeVisible({timeout:5000});
  await form.getByRole("combobox",{name:/^Sucursal/i}).selectOption("call-center");
  for(const role of ["ADMIN","CONTADOR"]){
    await form.getByRole("combobox",{name:/^Rol/i}).selectOption(role);
    await expect(form.getByText("Global (todas las sucursales)",{exact:true})).toBeVisible();
    await expect(form.getByRole("combobox",{name:/^Sucursal/i})).toHaveCount(0);
  }
  await form.getByRole("combobox",{name:/^Rol/i}).selectOption("CALL_CENTER");
  await expect(form.getByRole("combobox",{name:/^Sucursal/i})).toHaveValue("call-center");
  const email=`${tag}-created-call-center@smoke.local`.toLowerCase();
  await form.getByLabel("Nombre",{exact:true}).fill(`${tag}-Call Center creado`);
  await form.getByLabel("Correo",{exact:true}).fill(email);
  await form.getByLabel("Contraseña",{exact:true}).fill(password);
  await form.screenshot({path:"test-results/crm-call-center-crear-usuario.png"});
  await form.getByRole("button",{name:"Crear usuario",exact:true}).click();
  await expect(form.getByText("Usuario creado correctamente.",{exact:true})).toBeVisible();
  const created=await db.user.findUniqueOrThrow({where:{email},include:{branch:true}});
  expect(created.role).toBe("CALL_CENTER");
  expect(created.branch?.code).toBe("call-center");
  await page.reload();
  const userRow=page.getByRole("row").filter({has:page.getByRole("cell",{name:email,exact:true})});
  await expect(userRow.getByRole("cell",{name:"Call Center",exact:true})).toBeVisible();
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button",{name:/ingresar|entrar|acceder/i}).click();
  await page.waitForURL(/\/panel/);
  await page.goto(`/panel/leads?q=${encodeURIComponent(tag)}`);
  await expect(page.getByText(`${tag}-Lead B`,{exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Caja",exact:true})).toHaveCount(0);
});

test("Call Center trabaja entre sucursales, ve la ficha y guarda estrellas",async({page})=>{
  await login(page,"CALL_CENTER");
  await page.goto(`/panel/leads?q=${encodeURIComponent(tag)}`);
  await expect(page.getByText(`${tag}-Lead B`,{exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Caja",exact:true})).toHaveCount(0);
  await page.goto(`/panel/expedientes?expediente=${fileId}`);
  await expect(page.getByRole("heading",{name:`Ficha del cliente · ${tag}-Cliente B`})).toBeVisible();
  await expect(page.getByText("Constancia de prueba pendiente",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"5 estrellas",exact:true}).click();
  await expect(page.getByText("5/5 · Registrada por el equipo",{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{name:"5 estrellas",exact:true})).toHaveAttribute("aria-pressed","true");
  expect((await db.customerFile.findUniqueOrThrow({where:{id:fileId}})).serviceRating).toBe(5);
  await page.getByText("5/5 · Registrada por el equipo",{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:"test-results/crmcc1-expediente.png",fullPage:false});
  await page.getByRole("button",{name:/^Avisos/}).click();
  await expect(page.getByText(new RegExp(`Actividad vencida.*${tag}-Lead B`))).toBeVisible();
  await page.goto("/panel/actividades");
  await page.getByLabel(/Expediente relacionado/).selectOption(fileId);
  await page.getByLabel("Asignar atención a",{exact:true}).selectOption(staffBId);
  await page.getByPlaceholder("Ej. Llamar para confirmar documentación").fill(`${tag}-Atención en tienda`);
  await page.getByRole("button",{name:"Registrar actividad",exact:true}).click();
  await expect(page.getByPlaceholder("Ej. Llamar para confirmar documentación")).toHaveValue("");
  expect(await db.userNotification.count({where:{userId:staffBId,kind:"ACTIVIDAD_ASIGNADA",body:`${tag}-Atención en tienda`}})).toBe(1);
  await page.goto("/panel/contabilidad");
  await expect(page).toHaveURL(/\/panel\/leads/);
});

test("Actividades identifica cliente, lead y expediente; permite corregir una actividad general",async({page})=>{
  await login(page,"CALL_CENTER");
  await page.goto("/panel/actividades");
  const row = (description:string) => page.getByRole("article",{name:`Actividad: ${tag}-${description}`,exact:true});
  await expect(row("Cliente directo").getByText(`Cliente: ${tag}-Cliente B`,{exact:true})).toBeVisible();
  await expect(row("Seguimiento").getByText(`Lead: ${tag}-Lead B`,{exact:true})).toBeVisible();
  await expect(row("Solo expediente").getByText(`Cliente: ${tag}-Cliente B`,{exact:true})).toBeVisible();
  await expect(row("Solo expediente").getByRole("link",{name:`${tag}-EXP`,exact:true})).toBeVisible();
  await page.getByPlaceholder("Contacto, expediente o contenido").fill(`${tag}-Cliente B`);
  await expect(row("Solo expediente")).toBeVisible();
  await expect(row("Seguimiento")).toHaveCount(0);
  await page.getByPlaceholder("Contacto, expediente o contenido").fill("");

  const general = row("Sin contacto");
  await expect(general.getByText("Actividad general · Sin cliente vinculado",{exact:true})).toBeVisible();
  await general.getByText("Vincular cliente o lead",{exact:true}).click();
  await general.getByLabel("Buscar cliente o lead",{exact:true}).fill(`${tag}-Cliente B`);
  await general.getByRole("button",{name:"Buscar contacto",exact:true}).click();
  await expect(general.getByRole("option",{name:`Cliente: ${tag}-Cliente B · ${branchB.name}`,exact:true})).toBeAttached();
  await general.getByLabel("Cliente o lead relacionado",{exact:true}).selectOption(`customer:${customerBId}`);
  await general.getByRole("button",{name:"Guardar contacto",exact:true}).click();
  await expect(general.getByText(`Cliente: ${tag}-Cliente B`,{exact:true})).toBeVisible();
  await page.reload();
  await expect(general.getByText(`Cliente: ${tag}-Cliente B`,{exact:true})).toBeVisible();
  expect((await db.activity.findFirstOrThrow({where:{description:`${tag}-Sin contacto`}})).customerId).toBe(customerBId);

  const form = page.getByRole("group").filter({hasText:"Registrar actividad"});
  for (const [kind,id,name] of [["customer",customerBId,"Cliente B"],["lead",leadBId,"Lead B"]] as const) {
    await form.getByLabel("Buscar cliente o lead",{exact:true}).fill(`${tag}-${name}`);
    await form.getByRole("button",{name:"Buscar contacto",exact:true}).click();
    await expect(form.locator(`option[value="${kind}:${id}"]`)).toBeAttached();
    await form.getByLabel("Cliente o lead relacionado",{exact:true}).selectOption(`${kind}:${id}`);
    await page.getByPlaceholder("Ej. Llamar para confirmar documentación").fill(`${tag}-Nuevo ${kind}`);
    await page.getByRole("button",{name:"Registrar actividad",exact:true}).click();
    await expect(page.getByPlaceholder("Ej. Llamar para confirmar documentación")).toHaveValue("");
    await expect(row(`Nuevo ${kind}`).getByText(`${kind === "customer" ? "Cliente" : "Lead"}: ${tag}-${name}`,{exact:true})).toBeVisible();
    const saved = await db.activity.findFirstOrThrow({where:{description:`${tag}-Nuevo ${kind}`}});
    expect(kind === "customer" ? saved.customerId : saved.leadId).toBe(id);
    expect(saved.branchId).toBe(branchB.id);
  }
  await row("Solo expediente").scrollIntoViewIfNeeded();
  await page.screenshot({path:"test-results/crm-actividades-cliente.png",fullPage:false});
});

test("Actividades limita la búsqueda y el vínculo a la sucursal autorizada",async({page})=>{
  await login(page,"GERENTE");
  await page.goto("/panel/actividades");
  await expect(page.getByRole("article",{name:`Actividad: ${tag}-Solo expediente`,exact:true})).toHaveCount(0);
  const general=page.getByRole("article",{name:`Actividad: ${tag}-General A`,exact:true});
  await general.getByText("Vincular cliente o lead",{exact:true}).click();
  await general.getByLabel("Buscar cliente o lead",{exact:true}).fill(`${tag}-Cliente B`);
  await general.getByRole("button",{name:"Buscar contacto",exact:true}).click();
  await expect(general.getByText("No se encontraron contactos en tu alcance.",{exact:true})).toBeVisible();
  await general.getByLabel("Buscar cliente o lead",{exact:true}).fill(`${tag}-Cliente A`);
  await general.getByRole("button",{name:"Buscar contacto",exact:true}).click();
  await expect(general.locator(`option[value="customer:${customerAId}"]`)).toBeAttached();
  await general.getByLabel("Cliente o lead relacionado",{exact:true}).selectOption(`customer:${customerAId}`);
  await general.getByRole("button",{name:"Guardar contacto",exact:true}).click();
  await expect(general.getByText(`Cliente: ${tag}-Cliente A`,{exact:true})).toBeVisible();
});

test("Líder de Ventas controla inventario de su sucursal y conserva el rol",async({page})=>{
  await login(page,"LIDER_VENTAS");
  await page.goto("/panel/inventario/movimientos");
  await expect(page.getByRole("heading",{name:"Registrar egreso",exact:true})).toBeVisible();
  const model=await db.motorcycleCatalogModel.findUniqueOrThrow({where:{slug:"boxer-150x"}});
  await page.getByLabel(/^Modelo del catálogo/).selectOption(model.id);
  await page.getByLabel("Año",{exact:true}).fill("2027");
  await page.getByLabel("Número de chasis",{exact:true}).fill(chassis);
  await page.getByLabel("Número de motor",{exact:true}).fill(`${tag}-MOTOR`);
  await page.getByLabel("Color",{exact:true}).fill("Negro");
  await expect(page.getByText(branchA.name,{exact:false}).first()).toBeVisible();
  await page.getByRole("button",{name:"Registrar ingreso",exact:true}).click();
  await expect(page.getByText("Ingreso registrado correctamente.",{exact:true})).toBeVisible();
  const unit=await db.motorcycleUnit.findUniqueOrThrow({where:{chassisNumber:chassis}});
  expect(unit.branchId).toBe(branchA.id);expect(unit.year).toBe(2027);expect(unit.engineNumber).toBe(`${tag}-MOTOR`);
  expect((await db.user.findUniqueOrThrow({where:{id:users.LIDER_VENTAS!.id}})).role).toBe("LIDER_VENTAS");
  await page.reload();await expect(page.getByRole("cell",{name:chassis,exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/crmcc1-inventario.png",fullPage:true});
});

test("Marketing consulta todas las sucursales sin recibir controles de edición",async({page})=>{
  await login(page,"MARKETING");
  for(const section of ["leads","clientes","expedientes","inventario","reservas","ventas"]){
    await page.goto(`/panel/marketing/operacion?modulo=${section}&sucursal=${branchB.code}`);
    await expect(page.getByRole("heading",{name:"Consulta comercial",exact:true,level:2})).toBeVisible();
    await expect(page.getByRole("button",{name:/Guardar cambios|Registrar ingreso|Crear reserva/})).toHaveCount(0);
    if(section==="clientes")await expect(page.getByRole("cell",{name:`${tag}-Cliente B`,exact:true})).toBeVisible();
  }
});

test("Gerencia edita, elimina del listado y restaura sólo su sucursal",async({page})=>{
  await login(page,"GERENTE");
  const url=`/panel/gestion-crm?kind=customer&q=${encodeURIComponent(tag)}`;
  await page.goto(url);
  await expect(page.getByText(`${tag}-Cliente A · ${branchA.name}`,{exact:true})).toBeVisible();
  await expect(page.getByText(`${tag}-Cliente B · ${branchB.name}`,{exact:true})).toHaveCount(0);
  await page.getByLabel("Nombre",{exact:true}).last().fill(`${tag}-Cliente A editado`);
  await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
  await expect(page.getByText(`${tag}-Cliente A editado · ${branchA.name}`,{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Eliminar del listado",exact:true}).click();
  await page.getByRole("button",{name:"Confirmar eliminación del listado",exact:true}).click();
  await expect(page.getByText("No hay registros con estos filtros.",{exact:true})).toBeVisible();
  expect((await db.customer.findUniqueOrThrow({where:{id:customerAId}})).archivedAt).not.toBeNull();
  await page.goto(`${url}&archived=1`);
  await page.getByRole("button",{name:"Restaurar",exact:true}).click();
  await expect(page.getByText("No hay registros con estos filtros.",{exact:true})).toBeVisible();
  await page.goto(url);
  await expect(page.getByText(`${tag}-Cliente A editado · ${branchA.name}`,{exact:true})).toBeVisible();
});


test("Vendedor normal consulta inventario sin registrar ni dar de baja motos",async({page})=>{
  await login(page,"VENDEDOR");
  await page.goto("/panel/inventario/movimientos");
  await expect(page.getByRole("heading",{name:"Gestión de inventario restringida"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Registrar ingreso",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Registrar egreso",exact:true})).toHaveCount(0);
});
