import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { GLOBAL_BRANCH_ID, roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { accountingNavigation } from "@/features/operations/lib/accounting-nav";

const target=new URL(process.env.DATABASE_URL??"");assert.equal(target.hostname,"127.0.0.1");assert.equal(target.port,"55438");assert.equal(target.pathname,"/motomas_finance_test");
const db=new PrismaClient();const browser=await chromium.launch({headless:true});let passed=0;
function check(value:unknown,label:string){assert.ok(value,label);passed++;console.log(`OK ${label}`);}
try{
 const accountant=await db.user.findFirstOrThrow({where:{role:"CONTADOR",name:{startsWith:"COMPLETE-"}},orderBy:{createdAt:"desc"}});
 const admin=await db.user.findFirstOrThrow({where:{role:"ADMIN",name:accountant.name}});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(60000);
 const errors:string[]=[],pos:string[]=[];page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>{if(/\/(pos|panel\/pos)(\/|\?)/.test(new URL(request.url()).pathname))pos.push(request.url());});
 async function login(user:{id:string;name:string;email:string;role:UserRoleEnum}){const value=await createSessionToken({uid:user.id,name:user.name,email:user.email,role:roleEnumToSpanish[user.role],roleEnum:user.role,branchId:GLOBAL_BRANCH_ID,branchName:"Global"});await context.addCookies([{name:SESSION_COOKIE_NAME,value,domain:"127.0.0.1",path:"/"}]);}
 await login(accountant);await page.goto("http://127.0.0.1:5187/panel/contabilidad/gestion/configuracion",{timeout:180000});
 const heading=page.getByRole("heading",{name:"Configuración contable",exact:true});await heading.waitFor();
 const nav=page.getByRole("navigation",{name:"Navegación interna",exact:true});const menu=nav.getByRole("list",{name:"Opciones de Contabilidad",exact:true});await menu.waitFor();
 check(await menu.getByRole("link").count()===22,"Las 22 opciones contables están en la barra lateral principal del contador");
 check(await page.getByRole("navigation",{name:"Navegación contable del CRM",exact:true}).count()===0,"El menú interior fue eliminado");
 const links=await menu.getByRole("link").evaluateAll(items=>items.map(item=>item.getAttribute("href")));check(accountingNavigation.every(item=>links.includes(item.href)),"La barra conserva todas las rutas contables existentes");
 check((await heading.boundingBox())!.x<360,"El contenido usa el espacio liberado por el menú interior");
 await menu.getByRole("link",{name:"Cuentas por pagar",exact:true}).click();await page.getByRole("heading",{name:"Cuentas por pagar",exact:true}).waitFor();
 await expect(menu.getByRole("link",{name:"Cuentas por pagar",exact:true})).toHaveAttribute("aria-current","page");check(true,"Navegación lateral abre la sección y señala la opción activa");
 await nav.getByRole("button",{name:"Ocultar opciones de contabilidad",exact:true}).click();check(await nav.getByRole("list",{name:"Opciones de Contabilidad",exact:true}).count()===0,"El grupo Contabilidad se puede contraer");
 await nav.getByRole("button",{name:"Mostrar opciones de contabilidad",exact:true}).click();check(await menu.getByRole("link").count()===22,"El grupo se puede volver a desplegar");
 if(process.env.FINANCE_SCREENSHOT_DIR){await mkdir(process.env.FINANCE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.FINANCE_SCREENSHOT_DIR,"contabilidad-sidebar-escritorio.png")});}
 await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"Abrir menú",exact:true}).click();
 const drawer=page.getByRole("dialog",{name:"Navegación",exact:true});await drawer.waitFor();const mobileMenu=drawer.getByRole("list",{name:"Opciones de Contabilidad",exact:true});check(await mobileMenu.getByRole("link").count()===22,"El menú móvil contiene las mismas 22 opciones");
 if(process.env.FINANCE_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.FINANCE_SCREENSHOT_DIR,"contabilidad-sidebar-movil.png")});
 await mobileMenu.getByRole("link",{name:"Libro y estados",exact:true}).click();await drawer.waitFor({state:"hidden"});await page.getByRole("heading",{name:"Estados financieros comparativos y agrupados",exact:true}).waitFor();check(true,"Elegir una opción móvil abre su pantalla y cierra el cajón");
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"El contenido contable no desborda la pantalla móvil");
 await login(admin);await page.setViewportSize({width:1440,height:1000});await page.goto("http://127.0.0.1:5187/panel/contabilidad/gestion/configuracion",{timeout:180000});await page.getByRole("button",{name:"Guardar política",exact:true}).waitFor();check(await page.getByRole("list",{name:"Opciones de Contabilidad",exact:true}).getByRole("link").count()===22,"Administrador conserva las mismas opciones laterales y su configuración empresarial");
 assert.deepEqual(errors,[]);assert.deepEqual(pos,[]);check(true,"Sin errores de navegador ni solicitudes al POS");
}catch(error){console.error(error);process.exitCode=1;}finally{console.log(`${passed} verificaciones de navegación correctas`);await browser.close();await db.$disconnect();}
