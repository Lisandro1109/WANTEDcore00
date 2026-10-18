import "reflect-metadata";
import { inArray } from "drizzle-orm";
import { account, createCredentialUser, session, user, type Database } from "@wanted/db";

process.env.BETTER_AUTH_URL = "http://127.0.0.1:3011";
process.env.WEB_ORIGIN = "http://127.0.0.1:3011";

const { createApp } = await import("./app.ts");
const { DB } = await import("./tokens.ts");

const base = process.env.BETTER_AUTH_URL;
const origin = process.env.WEB_ORIGIN;
const stamp = Date.now();
const parentA = {
  name: "Padre A",
  email: `fase2-a-${stamp}@wanted.com`,
  password: "padre-a-local",
};
const parentB = {
  name: "Padre B",
  email: `fase2-b-${stamp}@wanted.com`,
  password: "padre-b-local",
};
const childEmail = `fase2-hijo-${stamp}@wanted.com`;
const childPassword = "hijo-b-local";
const nextPassword = "padre-b-nueva";
const extraEmails: string[] = [];

const app = await createApp();
await app.listen(3011);
const db = app.get<Database>(DB);

try {
  const health = await fetch(`${base}/api/health`);
  if (!health.ok) {
    throw new Error("La API no respondió.");
  }

  const adminCookie = await signIn(requiredEnv("ADMIN_EMAIL"), requiredEnv("ADMIN_PASSWORD"));
  const createdA = await send<{ id: string }>(adminCookie, "POST", "/api/platform/parents", parentA);
  const createdB = await send<{ id: string }>(adminCookie, "POST", "/api/platform/parents", parentB);
  await expectStatus(adminCookie, "POST", "/api/platform/parents", 400, {
    name: "Dominio ajeno",
    email: `fase2-dominio-${stamp}@gmail.com`,
    password: "dominio-local",
  });
  const localParentEmail = `fase2-local-${stamp}@wanted.com`;
  extraEmails.push(localParentEmail);
  await send(adminCookie, "POST", "/api/platform/parents", {
    name: "Solo local",
    email: `fase2-local-${stamp}`,
    password: "local-parte-ok",
  });
  const parents = await send<Array<{ email: string }>>(adminCookie, "GET", "/api/platform/parents");
  if (JSON.stringify(parents).includes(parentA.password)) {
    throw new Error("El listado expuso una contraseña.");
  }
  if (!parents.some((parent) => parent.email === parentA.email)) {
    throw new Error("El padre creado no aparece en el listado.");
  }
  await expectStatus(adminCookie, "GET", "/api/workspace", 403);

  const cookieA = await signIn(parentA.email, parentA.password);
  const spaceA = await send<{ parentId: string; parentEmail: string }>(cookieA, "GET", "/api/workspace");
  if (spaceA.parentId !== createdA.id || spaceA.parentEmail !== parentA.email) {
    throw new Error("El padre vio un espacio que no es el suyo.");
  }
  await expectStatus(cookieA, "GET", "/api/platform/parents", 403);

  await send(adminCookie, "POST", `/api/platform/parents/${createdA.id}/suspend`);
  if (await signIn(parentA.email, parentA.password).catch(() => null)) {
    throw new Error("Un padre suspendido pudo iniciar sesión.");
  }

  await createCredentialUser(db, {
    name: "Hijo B",
    email: childEmail,
    password: childPassword,
    kind: "child",
    parentId: createdB.id,
  });
  const childCookie = await signIn(childEmail, childPassword);
  const childSpace = await send<{ parentId: string; parentEmail: string }>(
    childCookie,
    "GET",
    "/api/workspace",
  );
  if (childSpace.parentId !== createdB.id || childSpace.parentEmail !== parentB.email) {
    throw new Error("El hijo no quedó dentro del espacio de su padre.");
  }

  await send(adminCookie, "POST", `/api/platform/parents/${createdB.id}/suspend`);
  if (await signIn(childEmail, childPassword).catch(() => null)) {
    throw new Error("El hijo entró con el padre suspendido.");
  }

  await send(adminCookie, "POST", `/api/platform/parents/${createdB.id}/activate`);
  await send(adminCookie, "POST", `/api/platform/parents/${createdB.id}/access`, {
    password: nextPassword,
  });
  if (await signIn(parentB.email, parentB.password).catch(() => null)) {
    throw new Error("La contraseña anterior sigue sirviendo.");
  }
  const renewed = await signIn(parentB.email, nextPassword);
  const renewedSpace = await send<{ parentId: string }>(renewed, "GET", "/api/workspace");
  if (renewedSpace.parentId !== createdB.id) {
    throw new Error("Después de restablecer el acceso, el padre vio otro espacio.");
  }

  const baseName = `Base ${stamp}`;
  const createdBase = await send<{ id: string }>(renewed, "POST", "/api/workspace/bases", { name: baseName });
  const createdTable = await send<{ id: string }>(renewed, "POST", `/api/workspace/bases/${createdBase.id}/tables`, {
    name: `Tabla ${stamp}`,
  });
  const hiddenBase = await send<{ id: string }>(renewed, "POST", "/api/workspace/bases", { name: `Oculta ${stamp}` });
  const hiddenTable = await send<{ id: string }>(renewed, "POST", `/api/workspace/bases/${hiddenBase.id}/tables`, {
    name: `Oculta ${stamp}`,
  });

  const viewAll = { sections: ["tables"], members: "none", tables: [{ target: "all", ...caps() }] };
  const operatorPermissions = {
    sections: ["tables"],
    members: "none",
    tables: [{ target: "table", targetId: createdTable.id, ...caps({ createRows: true, editRows: true, rowScope: "assigned" }) }],
  };

  const operatorEmail = `fase3-operador-${stamp}@wanted.com`;
  extraEmails.push(operatorEmail);
  const createdOperator = await send<{ id: string }>(renewed, "POST", "/api/workspace/members", {
    name: "Operador",
    email: operatorEmail,
    password: "operador-local",
    permissions: operatorPermissions,
  });
  const operatorCookie = await signIn(operatorEmail, "operador-local");
  await expectStatus(operatorCookie, "GET", "/api/workspace/members", 403);
  await expectStatus(operatorCookie, "POST", `/api/workspace/members/${createdOperator.id}`, 403, {
    name: "No debe editar",
    email: operatorEmail,
    permissions: viewAll,
  });
  const operatorSpace = await send<{ parentId: string }>(operatorCookie, "GET", "/api/workspace");
  if (operatorSpace.parentId !== createdB.id) {
    throw new Error("El operador vio otro espacio.");
  }
  const operatorBases = await send<Array<{ id: string }>>(operatorCookie, "GET", "/api/workspace/bases");
  if (!operatorBases.some((item) => item.id === createdBase.id) || operatorBases.some((item) => item.id === hiddenBase.id)) {
    throw new Error("El operador vio conjuntos sin acceso.");
  }
  await expectStatus(operatorCookie, "GET", `/api/workspace/data-tables/${hiddenTable.id}`, 403);
  await expectStatus(operatorCookie, "POST", "/api/workspace/bases", 403, { name: "No debe crear" });

  const editedEmail = `fase3-operador-editado-${stamp}@wanted.com`;
  extraEmails.push(editedEmail);
  await send(renewed, "POST", `/api/workspace/members/${createdOperator.id}`, {
    name: "Operador editado",
    email: editedEmail,
    permissions: viewAll,
    password: "operador-nueva",
  });
  if (await signIn(operatorEmail, "operador-local").catch(() => null)) {
    throw new Error("La contraseña anterior del hijo sigue sirviendo.");
  }
  const editedCookie = await signIn(editedEmail, "operador-nueva");
  const editedSpace = await send<{ parentId: string }>(editedCookie, "GET", "/api/workspace");
  if (editedSpace.parentId !== createdB.id) {
    throw new Error("La edición del hijo no quedó en su padre.");
  }
  const editedBases = await send<Array<{ id: string }>>(editedCookie, "GET", "/api/workspace/bases");
  if (!editedBases.some((item) => item.id === hiddenBase.id)) {
    throw new Error("Con acceso a todos los conjuntos, el hijo no vio todos.");
  }

  const adminChildEmail = `fase3-admin-${stamp}@wanted.com`;
  extraEmails.push(adminChildEmail);
  await send(renewed, "POST", "/api/workspace/members", {
    name: "Admin del espacio",
    email: adminChildEmail,
    password: "admin-espacio-local",
    permissions: {
      sections: ["tables"],
      members: "manage",
      tables: [
        {
          target: "all",
          ...caps({ createRows: true, editRows: true, deleteRows: true, export: true, manage: true, createTables: true, manageSets: true }),
        },
      ],
    },
  });
  const spaceAdminCookie = await signIn(adminChildEmail, "admin-espacio-local");
  const readerEmail = `fase3-lectura-${stamp}@wanted.com`;
  extraEmails.push(readerEmail);
  await send(spaceAdminCookie, "POST", "/api/workspace/members", {
    name: "Lectura",
    email: readerEmail,
    password: "lectura-local",
    permissions: viewAll,
  });
  const readerCookie = await signIn(readerEmail, "lectura-local");
  await expectStatus(readerCookie, "GET", "/api/workspace/members", 403);

  const limitedEmail = `fase3-limitado-${stamp}@wanted.com`;
  extraEmails.push(limitedEmail);
  await send(renewed, "POST", "/api/workspace/members", {
    name: "Limitado",
    email: limitedEmail,
    password: "limitado-local",
    permissions: {
      sections: ["tables"],
      members: "create",
      tables: [{ target: "table", targetId: createdTable.id, ...caps() }],
    },
  });
  const limitedCookie = await signIn(limitedEmail, "limitado-local");
  await expectStatus(limitedCookie, "POST", "/api/workspace/members", 403, {
    name: "Más que yo",
    email: `fase3-excedido-${stamp}@wanted.com`,
    password: "excedido-local",
    permissions: viewAll,
  });

  const listed = await send<Array<{ email: string }>>(renewed, "GET", "/api/workspace/members");
  if (!listed.some((item) => item.email === editedEmail) || listed.some((item) => item.email === operatorEmail || item.email === parentA.email)) {
    throw new Error("El listado de hijos no quedó dentro del padre.");
  }
  await expectStatus(adminCookie, "POST", "/api/workspace/members", 403, {
    name: "Desde admin",
    email: `fase3-admin-plataforma-${stamp}@wanted.com`,
    password: "no-debe-entrar",
    permissions: viewAll,
  });
  const table = await send<{
    fields: Array<{ id: string; name: string }>;
    rows: Array<{ cells: Record<string, string> }>;
  }>(renewed, "GET", `/api/workspace/data-tables/${createdTable.id}`);
  const nameField = table.fields[0];
  if (!nameField || nameField.name !== "Nombre") {
    throw new Error("La tabla no creó el campo Nombre.");
  }
  const defined = await send<{ id: string }>(renewed, "POST", `/api/workspace/bases/${createdBase.id}/tables`, {
    name: `Columnas ${stamp}`,
    fields: [
      {
        name: "Cliente",
        description: "Quien compra",
        fieldType: "text",
        format: "plain",
        required: true,
        unique: false,
        defaultValue: "",
        options: "",
      },
      {
        name: "Correo",
        description: "",
        fieldType: "text",
        format: "email",
        required: false,
        unique: true,
        defaultValue: "",
        options: "",
      },
    ],
  });
  const definedTable = await send<{
    fields: Array<{ name: string; required: boolean; unique: boolean; format: string }>;
  }>(renewed, "GET", `/api/workspace/data-tables/${defined.id}`);
  const definedNames = definedTable.fields.map((field) => field.name).join(",");
  if (
    definedNames !== "Cliente,Correo" ||
    definedTable.fields[0]?.required !== true ||
    definedTable.fields[1]?.format !== "email" ||
    definedTable.fields[1]?.unique !== true
  ) {
    throw new Error("La tabla no guardó las columnas definidas al crearla.");
  }
  const renamedTable = await send<{ name: string }>(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}`, {
    name: `Tabla editada ${stamp}`,
  });
  const renamedBase = await send<{ name: string }>(renewed, "POST", `/api/workspace/bases/${createdBase.id}`, {
    name: `Base editada ${stamp}`,
  });
  if (renamedTable.name !== `Tabla editada ${stamp}` || renamedBase.name !== `Base editada ${stamp}`) {
    throw new Error("No se pudo cambiar el nombre de la base o de la tabla.");
  }
  await expectStatus(readerCookie, "POST", `/api/workspace/data-tables/${createdTable.id}`, 403, { name: "no" });
  await send(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, {
    cells: { [nameField.id]: "alfa" },
  });
  await expectStatus(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, 400, {
    cells: {},
  });
  const storedRows = await send<{ rows: Array<{ cells: Record<string, string> }> }>(
    renewed,
    "GET",
    `/api/workspace/data-tables/${createdTable.id}`,
  );
  if (!storedRows.rows.some((row) => row.cells[nameField.id] === "alfa")) {
    throw new Error("La fila creada no volvió en el listado.");
  }
  const emailField = await send<{ id: string }>(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/fields`, {
    name: "Correo",
    description: "Correo del contacto",
    fieldType: "text",
    format: "email",
    required: true,
    unique: true,
    defaultValue: "",
    options: "",
  });
  await expectStatus(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, 400, {
    cells: { [emailField.id]: "no-es-correo" },
  });
  await send(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, {
    cells: { [emailField.id]: "ana@wanted.com" },
  });
  await expectStatus(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, 409, {
    cells: { [emailField.id]: "ana@wanted.com" },
  });
  const readerTable = await send<{ rows: Array<{ cells: Record<string, string> }> }>(
    readerCookie,
    "GET",
    `/api/workspace/data-tables/${createdTable.id}`,
  );
  if (!readerTable.rows.some((row) => row.cells[nameField.id] === "alfa")) {
    throw new Error("Lectura no vio la fila del espacio.");
  }
  await expectStatus(readerCookie, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, 403, { cells: {} });

  const scopedEmail = `fase5-operador-${stamp}@wanted.com`;
  extraEmails.push(scopedEmail);
  const scopedUser = await send<{ id: string }>(renewed, "POST", "/api/workspace/members", {
    name: "Operador tablas",
    email: scopedEmail,
    password: "operador-tablas",
    permissions: operatorPermissions,
  });
  await send(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, {
    cells: { [nameField.id]: "solo-asignado", [emailField.id]: "asignado@wanted.com" },
    assigneeId: scopedUser.id,
  });
  await send(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/rows`, {
    cells: { [nameField.id]: "de-nadie", [emailField.id]: "nadie@wanted.com" },
  });
  const scopedCookie = await signIn(scopedEmail, "operador-tablas");
  const scopedTable = await send<{ rows: Array<{ cells: Record<string, string> }> }>(
    scopedCookie,
    "GET",
    `/api/workspace/data-tables/${createdTable.id}`,
  );
  const scopedValues = scopedTable.rows.map((row) => row.cells[nameField.id]);
  if (!scopedValues.includes("solo-asignado") || scopedValues.includes("de-nadie") || scopedValues.includes("alfa")) {
    throw new Error("El operador vio filas que no tiene asignadas.");
  }

  const exported = await send<{ contentBase64: string }>(
    renewed,
    "POST",
    `/api/workspace/data-tables/${createdTable.id}/export`,
    { format: "csv" },
  );
  if (!Buffer.from(exported.contentBase64, "base64").toString("utf8").includes("alfa")) {
    throw new Error("La exportación no incluyó el valor.");
  }
  await expectStatus(readerCookie, "POST", `/api/workspace/data-tables/${createdTable.id}/export`, 403, {
    format: "csv",
  });
  await send(renewed, "POST", `/api/workspace/data-tables/${createdTable.id}/import`, {
    format: "csv",
    contentBase64: Buffer.from("Nombre,Correo\nimportada,importada@wanted.com\n", "utf8").toString("base64"),
  });
  const imported = await send<{ rows: Array<{ cells: Record<string, string> }> }>(
    renewed,
    "GET",
    `/api/workspace/data-tables/${createdTable.id}`,
  );
  if (!imported.rows.some((row) => row.cells[nameField.id] === "importada")) {
    throw new Error("La importación no agregó la fila.");
  }

  await send(adminCookie, "POST", `/api/platform/parents/${createdA.id}/activate`);
  const cookieA2 = await signIn(parentA.email, parentA.password);
  const foreign = await send<Array<{ name: string }>>(cookieA2, "GET", "/api/workspace/bases");
  if (foreign.some((item) => item.name === baseName)) {
    throw new Error("Otro padre vio la base.");
  }
  await expectStatus(adminCookie, "POST", "/api/workspace/bases", 403, { name: "Desde admin" });

  console.log("Admin, padres, hijos, permisos y tablas verificados.");
} finally {
  const emails = [parentA.email, parentB.email, childEmail, ...extraEmails];
  const rows = await db.select({ id: user.id, kind: user.kind }).from(user).where(inArray(user.email, emails));
  const childIds = rows.filter((row) => row.kind === "child").map((row) => row.id);
  const parentIds = rows.filter((row) => row.kind === "parent").map((row) => row.id);
  const ids = [...childIds, ...parentIds];
  if (ids.length > 0) {
    await db.delete(session).where(inArray(session.userId, ids));
    await db.delete(account).where(inArray(account.userId, ids));
    if (childIds.length > 0) {
      await db.delete(user).where(inArray(user.id, childIds));
    }
    if (parentIds.length > 0) {
      await db.delete(user).where(inArray(user.id, parentIds));
    }
  }
  await app.close();
}

async function signIn(email: string, password: string) {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`No se pudo entrar con ${email}: ${response.status}`);
  }
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const header = cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  if (!header) {
    throw new Error("La sesión no devolvió cookie.");
  }
  return header;
}

async function send<T>(cookie: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie, origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} respondió ${response.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function expectStatus(
  cookie: string,
  method: string,
  path: string,
  status: number,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie, origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status !== status) {
    throw new Error(`${method} ${path} respondió ${response.status}, se esperaba ${status}.`);
  }
}

function caps(over: Record<string, unknown> = {}) {
  return {
    createRows: false,
    editRows: false,
    deleteRows: false,
    export: false,
    manage: false,
    createTables: false,
    manageSets: false,
    rowScope: "all",
    ...over,
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name} en el entorno.`);
  }
  return value;
}
