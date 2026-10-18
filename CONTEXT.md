# WANTED core — Contexto del proyecto

Fuente de verdad del producto, de su estructura y del estado de cada parte.
Leer este archivo antes de integrar, editar o eliminar cualquier cosa del repositorio.
Actualizarlo en el mismo cambio cuando el sistema cambie.

Última revisión: 2026-10-14.

## Obligación de uso

Este archivo es obligatorio para quien programe el proyecto y para cualquier agente de IA que trabaje en él.

Antes de integrar, editar o eliminar:

1. Leer este archivo completo.
2. Respetar las decisiones cerradas, el modelo de cuentas y el estado de cada parte.
3. Limitar el trabajo a la fase en curso. Las partes marcadas como futuras se describen aquí y no se implementan hasta que este archivo las pase a en curso.

En el mismo cambio, actualizar este archivo cuando ocurra cualquiera de estos casos:

- Se agrega, renombra, mueve o elimina una app, un paquete, un módulo, una tabla, una pantalla o una integración.
- Cambia una decisión de cuentas, permisos, canales, idioma, alojamiento o arquitectura.
- Cambia el estado de una parte: `planificado`, `en curso`, `activo` o `retirado`.

Qué actualizar:

- La sección de la parte afectada.
- La estructura del repositorio, si cambian carpetas o archivos de primer nivel.
- El registro de cambios, con fecha y una línea de qué pasó.

Si el cambio no altera el sistema (un ajuste interno que no mueve límites, datos ni comportamiento visible), no reescribas este archivo.

La regla de Cursor que exige este flujo está en `.cursor/rules/contexto-proyecto.mdc`.

## Qué es

WANTED core es un espacio de trabajo por usuario padre. Tiene clientes web, de escritorio y móvil, una sola API y una sola base de datos. Dentro de cada padre conviven tablas, un CRM, una bandeja de WhatsApp y automatizaciones. Esos módulos comparten datos: un contacto puede ser una fila, y un mensaje puede disparar una automatización.

La fase 5 ya está en el repositorio: cada padre tiene bases y tablas propias, con campos, filas y vistas. El admin sigue sin abrir esos datos ni crear hijos.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Nombre comercial | WANTED core |
| Idioma | Español en la interfaz. Los textos viven en un catálogo desde el inicio. Otros idiomas se agregan después, sin selector todavía. |
| WhatsApp | Primero sesión de WhatsApp Web. La API oficial de WhatsApp se agrega después, detrás del mismo adaptador de canal. |
| Alojamiento | Local con Docker Compose. Después, la misma pila se muda a una notebook vieja usada como servidor. |
| Correo | Único en todo el sistema. Siempre es `algo@wanted.com`. Al crear o editar se escribe solo la parte anterior a la arroba; `@wanted.com` no se puede cambiar. Para entrar hay que escribir el correo completo, dominio incluido. |
| Alta de padres | Solo la cuenta admin de plataforma puede crear usuarios padre. No hay registro público. |
| Aislamiento | Cada padre tiene sus hijos y sus datos separados de los demás padres. |
| Admin y datos | El admin ve el estado de los padres. No abre tablas, CRM ni chats de un padre. |
| Hijos | Los crea el padre, o un hijo con permiso de miembros. El admin no crea hijos. |

## Cuentas y permisos

```text
Admin de plataforma
  └── crea usuarios padre (única vía)
        └── cada padre tiene sus usuarios hijos
              └── tablas, CRM, WhatsApp y automatizaciones
                  aislados de los demás padres
```

**Admin de plataforma.** Una cuenta sembrada al instalar, con correo y contraseña en el entorno. Entra a una sección propia, separada del espacio de trabajo. Crea, activa, suspende y restablece el acceso de los padres. Ve nombre, correo, estado, cantidad de hijos y última entrada. Si suspende a un padre, los hijos de ese padre dejan de entrar.

**Usuario padre.** Nace solo desde el admin. Al crearlo se abre su espacio. Su correo no puede usarse como hijo de otro padre.

**Usuario hijo.** Correo único, atado a un solo padre. Entra al espacio de ese padre con los permisos que le den al crearlo o editarlo.

Al iniciar sesión, el admin va a su sección. El padre y los hijos van al espacio de trabajo, recortado por permisos.

No hay roles. El padre tiene todo. Cada hijo tiene permisos propios:

- **Secciones:** Tablas, CRM, Bandeja y Automatizaciones. Las tres últimas se pueden marcar, pero llegan después.
- **Miembros:** ninguno, ver, crear o administrar usuarios hijo.
- **Acceso a tablas:** todos los conjuntos, o conjunto por conjunto (todas sus tablas o solo algunas). Cada regla dice qué puede hacer además de ver: agregar, editar y borrar filas, exportar, administrar la tabla (columnas, nombre, vistas compartidas y borrarla), crear tablas en el conjunto y, solo con todos los conjuntos, administrar conjuntos. También dice qué filas ve: todas, las propias o las asignadas. Para una tabla vale la regla más específica: tabla, después conjunto, después todos.
- **Delegación:** un hijo con permiso de miembros solo da lo que él tiene, nunca más.

Los permisos no aplican al admin de plataforma.

Toda fila de negocio lleva el identificador del padre. La API resuelve la sesión y limita la consulta a ese padre.

## Arquitectura

```text
Web (navegador)  ──┐
Escritorio       ──┼──►  API única  ──►  PostgreSQL (una sola base)
Móvil            ──┘         │
                             ├── Redis (colas y tiempo real)
                             ├── Archivos
                             └── Worker de WhatsApp Web
```

Los clientes hablan solo con la API. La sesión de WhatsApp Web vive en un proceso aparte, porque tiene que quedar abierta. Más adelante, la API oficial de WhatsApp entra como segundo adaptador. La bandeja, el CRM y las automatizaciones siguen iguales.

## Estructura del repositorio

Crear cada carpeta que falta cuando empiece la fase que la necesita.

```text
CONTEXT.md                         este documento
.cursor/rules/contexto-proyecto.mdc
.env.example                       variables locales, sin secretos reales
docker-compose.yml                 PostgreSQL y Redis
package.json                       scripts del monorepo
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
packages/db/                       esquema, migraciones, siembra del admin, reglas de sesión
packages/shared/                   tipos de cuenta, permisos y catálogo en español
apps/api/                          API NestJS: auth, admin y espacio
apps/web/                          web: admin y shell del espacio, con módulos según los permisos
apps/desktop/                      cliente de escritorio, aún no creado
apps/mobile/                       cliente móvil, aún no creado
apps/wa-worker/                    sesiones de WhatsApp Web, aún no creado
packages/ui/                       interfaz compartida, aún no creada
```

## Partes

Estados: `planificado` (acordado, sin código), `en curso` (se está construyendo), `activo` (usable), `retirado` (sacado del producto; se documenta el reemplazo).

### Contexto y regla

- **Estado:** activo
- **Ruta:** `CONTEXT.md`, `.cursor/rules/contexto-proyecto.mdc`
- **Función:** describir el producto y obligar a mantener esta descripción al día.

### Base local

- **Estado:** activo
- **Ruta:** `docker-compose.yml`, `.env.example`
- **Función:** levantar PostgreSQL 17 y Redis 7 en la máquina de desarrollo. La misma pila se copia después a la notebook. API, web y el worker de WhatsApp se suman a Compose cuando existan esas aplicaciones.
- **Datos que persisten:** volumen `postgres_data` y volumen `redis_data`. Los volúmenes de sesiones de WhatsApp y de archivos entran con el worker.
- **Arranque:** `docker compose up -d`, luego `pnpm db:migrate` y `pnpm db:seed`. Después, `pnpm dev:api` y `pnpm dev:web`. El correo, la contraseña y el nombre del admin salen de `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NAME`. El puerto publicado de PostgreSQL es `POSTGRES_PORT` (5432 si no se define). La API escucha en `API_PORT` (3001) y la web en el 3000.
- **En este equipo:** Docker Desktop y WSL 2 están instalados y la pila de datos está levantada. Un PostgreSQL 18 de Windows ya ocupa el puerto 5432, y Windows reserva el rango 5433–5632, así que el contenedor publica el 15433 (`POSTGRES_PORT` en `.env`). Redis queda en el 6379. La API y la web corren en el host, contra esa base. Entran a Compose cuando la pila se mude a la notebook.

### Cuenta admin

- **Estado:** activo
- **Ruta:** `packages/db` (siembra y Better Auth), `apps/api` (rutas de plataforma), `apps/web` (sección `/admin`)
- **Función:** sembrar un solo admin. Desde su sección crea, activa, suspende y restablece el acceso de los padres. Ve nombre, correo, estado, cantidad de hijos y última entrada.
- **No incluye:** lectura de tablas, CRM o mensajes de un padre, ni alta de hijos. El alta pública está desactivada.

### Usuarios padre

- **Estado:** activo
- **Ruta:** `apps/api` (`POST /api/platform/parents`), `apps/web` (`/espacio`)
- **Función:** el admin crea el padre con nombre, correo y contraseña. Ese usuario es su espacio: el identificador de padre en las consultas es el id de ese usuario. Un padre solo puede leer su propio espacio. No ve la sección de plataforma.
- **Depende de:** cuenta admin, base de datos.

### Usuarios hijo y permisos

- **Estado:** activo
- **Ruta:** `packages/db` (`member_permission`, `member_table_access`, `roles.ts`), `packages/shared` (`access.ts`, `permissions.ts`), `apps/api` (`/api/workspace/members` y `/api/workspace/members/access-options`), `apps/web` (`/espacio/ajustes`: sección Usuarios hijo, `permissions.tsx`; `/espacio/miembros` redirige ahí)
- **Función:** el padre, o un hijo con permiso de miembros, crea hijos con nombre, correo único, contraseña y permisos. El formulario muestra las secciones con interruptores (CRM, Bandeja y Automatizaciones dicen "Llega después"), el nivel de miembros y el acceso a tablas: todos los conjuntos, o un desplegable por conjunto con ninguna, todas o algunas tablas; cada tabla elegida abre sus capacidades y qué filas ve. `access-options` devuelve solo los conjuntos, tablas y capacidades que quien edita puede dar; lo demás aparece deshabilitado. La API vuelve a validar: descarta conjuntos y tablas de otro padre y, si un hijo intenta dar más de lo que tiene, responde 403. `member_permission` guarda secciones y nivel de miembros como permisos (módulo, acción, alcance); `member_table_access` guarda las reglas de tablas (todos, conjunto o tabla, con sus capacidades y alcance de filas). Quien administra miembros edita nombre, correo, contraseña y permisos de un hijo de su padre, y puede suspenderlo, activarlo o restablecerle el acceso; nadie se edita ni se suspende a sí mismo. Si cambia la contraseña, se cierran las sesiones de ese hijo. Quien solo puede crear no edita hijos. Quien no tiene permiso de miembros no ve la lista.
- **Migración:** al quitar los roles, los hijos existentes quedaron sin permisos hasta que se los configure.
- **No incluye:** roles ni plantillas de permisos, ni que el admin cree hijos. `POST /api/workspace/members` rechaza al admin.
- **Depende de:** usuarios padre.

### Interfaz

- **Estado:** activo
- **Ruta:** `apps/web` (`/espacio` y sus módulos)
- **Función:** visual negra y blanca, minimalista. Fondo `#0A0A0A`, paneles `#111111`, hover `#1A1A1A`, texto `#FFFFFF` y `#A3A3A3`, bordes de 1 px. Tipografía Inter.
- **Escritorio:** arriba flota una barra en todas las secciones. A la izquierda del logo hay un botón para desplegar el menú de módulos. Después está el logo, con WANTED y core debajo, alineados a la derecha entre sí, un separador y el título de la sección. A la derecha están las notificaciones y el nombre con la foto del perfil. La foto abre un menú sobrio con la foto o iniciales, el nombre y el correo arriba, y opciones con ícono: ver perfil, configuración (la sección desde donde se configura todo) y, separado al pie, salir. Ver perfil abre un panel flotante de solo lectura con la foto, el nombre, el correo, el tipo de cuenta y, en un usuario hijo, la cuenta padre. La campana reúne los avisos de los módulos (hoy, Tablas). Los cambios se publican en el registro de actividad del servidor (`activity`, `/api/workspace/activity`) con el autor que pone la API desde la sesión; la campana lo consulta cada 15 segundos y al volver a la pestaña. El padre ve la actividad de todo su espacio, propia y de sus usuarios hijo; cada hijo ve solo la suya. Los errores y "Datos actualizados" quedan solo en el navegador. En la cuenta padre, la lista muestra quién hizo cada cambio ajeno y el detalle agrega "Realizado por". Visto, quitado y silenciado se guardan en este navegador (hasta 50 avisos). El registro se borra a los 30 días. Cada aviso nuevo sale unos segundos como burbuja desde la campana y vuelve a entrar; si están silenciadas, se guardan sin burbuja. Cada aviso lleva un punto de color según su tipo: verde listo, azul información, ámbar atención y rojo error; el punto de la campana toma el color del aviso sin ver más reciente. El panel muestra la lista con una descripción del cambio, el origen y hace cuánto pasó, permite quitar uno, y arriba tiene iconos para marcarlas vistas, silenciarlas y eliminarlas todas. Al hacer clic en un aviso, o en la burbuja, se abre un panel flotante con el detalle: datos del cambio (tabla, conjunto, filas, columnas, antes y ahora), la lista de elementos afectados y la fecha y hora. Si fue un borrado, ofrece restaurar mientras no pasen 24 horas; al restaurar, Tablas se actualiza sola. Los módulos avisan con `notify` (`apps/web/lib/notify.ts`). La validación del aviso vive en `packages/shared` (`activity.ts`): límites de largo y una lista cerrada de rutas de restaurar, porque un aviso publicado por un hijo puede llegar al padre. Los errores de validación de los formularios flotantes siguen dentro del formulario. A la izquierda flota el menú de módulos, en iconos o desplegado con iconos y texto. No muestra el nombre de la cuenta.
- **Móvil:** ese menú sigue flotando en iconos y se despliega con el mismo botón, a la izquierda del logo. La grilla de tablas se desplaza en horizontal y deja fijos el check de la fila y la primera columna de datos. El chat a pantalla completa llega con la bandeja.
- **Módulos del shell:** Tablas y Configuración ya funcionan. Configuración se divide en microsecciones, elegidas desde una lista a la izquierda (arriba, en pantallas chicas) y guardadas en la dirección (`#usuarios`): hoy solo Usuarios hijo (crear, editar, dar permisos y administrar el acceso); la barra izquierda no muestra Miembros aparte, y la entrada Configuración aparece con el permiso de miembros, mostrando solo las secciones permitidas. CRM, Bandeja y Automatizaciones muestran que llegan después.
- **Idioma:** catálogo en español. Sin selector hasta la fase de idiomas.
- **Pendiente:** `packages/ui`, cuando escritorio o móvil compartan estos componentes.

### Tablas

- **Estado:** activo
- **Ruta:** `packages/db` (`data_base`, `data_table`, `data_field`, `data_row`, `data_cell`, `data_view`), `apps/api` (`/api/workspace/bases` y `/api/workspace/data-tables`), `apps/web` (`/espacio/tablas`)
- **Función:** cada padre crea conjuntos y, dentro, tablas. En la interfaz el conjunto es la base ya guardada. El nombre del conjunto y el de la tabla se pueden cambiar después. Al entrar en Tablas, el título queda solo en la barra superior. A la izquierda del selector de tablas, pegado, hay un selector de conjuntos. Se abre en un menú, con botones arriba para crear un conjunto o editar los existentes, y debajo los conjuntos. Al editar se puede renombrar o borrar un conjunto; borrar también elimina sus tablas, con confirmación previa. Cada conjunto muestra solo sus tablas. A la derecha de esa sección, separado, está el botón para crear una tabla, solo si el conjunto ya tiene al menos una. Si no hay conjuntos, o el conjunto elegido no tiene tablas, el centro de la sección lo dice con un dibujo sobrio y ofrece crear un conjunto o una tabla según el caso. Al crearla se elige el conjunto al que pertenece. Debajo se ve la tabla elegida con sus datos. A la derecha de Tablas hay una barra solo de iconos, uno debajo del otro, en tres grupos separados por una línea corta: editar y formulario; buscar en la tabla, alternar filas compactas o amplias y recargar datos; y exportar (CSV o Excel). Cada icono muestra su nombre al pasar el mouse y el activo lleva una marca blanca a la izquierda. Buscar filtra al instante las filas cargadas que contienen el texto en alguna columna visible, y se limpia al cambiar de tabla. La densidad elegida se recuerda en el navegador. Esa barra se apoya en el borde derecho, con borde a la izquierda, arriba y abajo, esquinas izquierdas redondeadas y el mismo margen arriba y abajo. Solo aparece con una tabla abierta; si no hay conjuntos o no hay tabla abierta, el selector deja margen a la derecha. Importar está dentro de Crear tabla: elige el conjunto y un CSV o Excel; siempre crea una tabla nueva en ese conjunto, con columnas según el encabezado del archivo. Solo usa columnas con datos (máximo 100). Mientras importa, un panel flotante muestra la carga; al terminar, la tabla nueva aparece en el selector y se abre sola, sin recargar la página. Si la importación falla a mitad, se borra la tabla a medias. Editar abre el formulario de columnas y, ahí, se puede borrar la tabla. El título de cada columna muestra el nombre, sin el tipo debajo. Los avisos y errores generales de Tablas van a la campana de la barra superior. Borrar un conjunto, una tabla o filas no los elimina al instante: quedan marcados con `deleted_at`, desaparecen de todas las consultas y se pueden restaurar durante 24 horas desde el aviso. Restaurar una tabla exige que su conjunto esté activo; restaurar un conjunto trae las tablas que se borraron con él. Si mientras tanto se creó otro con el mismo nombre, el restaurado suma "(restaurada)". Una purga en la API, cada 30 minutos, elimina para siempre lo que pasó las 24 horas. Quitar columnas sigue siendo definitivo. Crear tabla, editar columnas, crear conjunto y editar conjuntos comparten el mismo estilo de formulario flotante: tipografía sobria, lista scrolleable y pie fijo. Crear tabla lleva conjunto y nombre arriba, importar CSV/Excel en el medio, y columnas esenciales (nombre, tipo, formato y opciones). Editar columnas usa la misma lista con los campos completos y permite borrar la tabla desde el pie. Crear conjunto pide solo el nombre. Editar conjuntos lista cada uno para renombrar o borrar, muestra un desplegable con las tablas del conjunto, y desde ahí también se puede crear uno nuevo. El máximo de columnas es 100. Si no se mandan columnas, la tabla nace con el campo de texto Nombre y la vista compartida Grilla. Dentro de la tabla hay tres partes: columnas, formulario y datos. Cada columna define para qué sirve, el tipo (texto, número, fecha, lista, casilla, identificador o JSON), el formato (texto libre, correo, teléfono, enlace, texto largo, entero, decimal, moneda, porcentaje, fecha o fecha y hora; el identificador puede ser UUID estándar o código de longitud fija, de 4 a 64 letras y números, guardado en mayúsculas y con botón para generarlo), si es obligatoria, si es única y un valor por defecto. El formulario y la grilla cargan filas a mano respetando esas reglas. En cada encabezado de la grilla hay un botón de orden: un clic ordena ascendente, otro descendente y otro lo quita. Filtros por columna, mostrar u ocultar columnas y la configuración de vista quedan fuera de la interfaz por ahora; solo está la búsqueda rápida de la barra. Las filas guardan cada valor como texto. La grilla no muestra la columna de asignado ni una columna para borrar. Cada fila empieza con el número de línea, sutil, y el check. Al elegir una celda y, con Mayús, otra, quedan elegidas todas las celdas del medio. La grilla solo muestra los datos y no deja cambiar las celdas ahí. Al marcar una o más filas, abajo flota una barra para editarlas o borrarlas. Editar abre un formulario con esas filas, donde se puede cambiar cualquier celda. Junto a Agregar fila hay un contador (de 1 a 10) para elegir cuántas filas cargar. El formulario muestra esa cantidad y cada una exige que al menos una celda tenga contenido. Las filas también pueden asignarse desde el formulario. Las vistas son grilla, kanban, calendario y formulario. En la grilla se ordena desde el encabezado de cada columna. Si hay muchas columnas, la grilla tiene desplazamiento horizontal. La grilla toma la altura de sus filas y, como máximo, el alto que le deja la pantalla. Si hay muchas filas, el desplazamiento vertical queda dentro de la tabla y los títulos siguen fijos. Al abrir una tabla se muestra primero un bloque de filas y el resto se carga en segundo plano, sin esperar el total; cada fila entra desde la derecha, una tras otra. Las transiciones de Tablas usan una misma curva y tiempos cortos, solo con opacidad y desplazamientos chicos, sin desenfoque. El check y la primera columna de datos quedan fijos. Exportar e importar CSV o Excel viaja en JSON, en base64. La importación crea la tabla en el conjunto activo. Un hijo solo ve los conjuntos y tablas a los que tiene acceso, y los botones aparecen según sus capacidades: crear, editar y borrar conjuntos con administrar conjuntos; crear tabla e importar con crear tablas en ese conjunto; editar columnas, renombrar y borrar la tabla con administrar la tabla; y agregar, editar, borrar filas y exportar con su permiso. La API devuelve esas capacidades (`canCreateTables` en cada conjunto y `caps` en la tabla) y vuelve a chequearlas en cada acción. El alcance de filas de la regla filtra lo que ve: todas, solo las propias o solo las asignadas. Una vista personal la ve quien la creó; si se marca compartida, la ve quien puede ver la tabla, y compartirla exige administrar la tabla.
- **No incluye:** fórmulas ni el conector con Google Sheets.
- **Depende de:** permisos e interfaz.

### CRM

- **Estado:** planificado
- **Función:** contactos, empresas, oportunidades, pipeline y ficha de actividad. El teléfono del contacto enlaza con WhatsApp. Una oportunidad puede vincularse a una fila.
- **Depende de:** tablas e interfaz.

### WhatsApp Web

- **Estado:** planificado
- **Ruta prevista:** `apps/wa-worker`
- **Función:** primer canal real. Muestra el QR, guarda la sesión del padre y recibe y envía mensajes a la bandeja. Un hijo vincula un número solo si sus permisos lo permiten. El contacto se asocia por teléfono.
- **Límite conocido:** la sesión puede cortarse y el número puede quedar limitado. Sesiones y archivos van en un volumen propio para poder respaldarlos.
- **Depende de:** CRM, permisos, Redis.

### WhatsApp API

- **Estado:** planificado (futuro)
- **Función:** segundo adaptador, WhatsApp Cloud API, sobre la misma bandeja. Plantillas, webhooks y ventana de 24 horas. No se implementa en las primeras fases.

### Automatizaciones

- **Estado:** planificado
- **Función:** disparador, condiciones y acciones. Disparadores: fila creada o modificada, etapa cambiada, mensaje recibido, horario. Acciones: actualizar un campo, asignar un usuario, crear una tarea, enviar un mensaje, llamar un webhook. Corren en cola, con reintentos e historial.
- **Depende de:** tablas, CRM, WhatsApp Web, Redis.

### Cliente web

- **Estado:** en curso
- **Ruta:** `apps/web`
- **Pila:** Next.js
- **Función actual:** entrada, sección del admin, shell del espacio y tablas. El padre y los hijos navegan los módulos que sus permisos habilitan. Configuración (con usuarios hijo y sus permisos) y tablas están en ese shell. La barra flotante superior está en el espacio y en la sección del admin.
- **Arranque:** `pnpm dev:web` en http://localhost:3000

### Cliente de escritorio

- **Estado:** planificado (futuro)
- **Ruta prevista:** `apps/desktop`
- **Pila:** Tauri 2
- **Función:** la misma interfaz web en ventana nativa. Empieza cuando la API de padres, permisos y bandeja esté firme.

### Cliente móvil

- **Estado:** planificado (futuro)
- **Ruta prevista:** `apps/mobile`
- **Pila:** Expo (React Native)
- **Función:** app iOS y Android contra la misma API. Misma condición de inicio que el escritorio.

### API

- **Estado:** en curso
- **Ruta:** `apps/api`
- **Pila:** NestJS y Better Auth
- **Función actual:** autenticar, impedir el alta pública y separar plataforma de espacio. El admin usa `/api/platform/parents`. El padre y sus hijos usan `/api/workspace` con el `parentId` de la sesión. Los miembros y sus permisos salen de `/api/workspace/members`, y lo que cada uno puede delegar, de `/api/workspace/members/access-options`. Las bases y tablas salen de `/api/workspace/bases` y `/api/workspace/data-tables`. Una cuenta suspendida no abre sesión. Si el padre está suspendido, sus hijos tampoco. Al suspender o restablecer el acceso se cierran las sesiones de esa familia. Suspender un hijo cierra solo las sesiones de ese hijo.
- **Arranque:** `pnpm dev:api` en http://localhost:3001
- **Cuerpo JSON:** hasta 32 MB, para importar y exportar CSV o Excel en base64.
- **Pendiente:** CRM, bandeja y automatizaciones.

### Base de datos y paquetes compartidos

- **Estado:** en curso
- **Ruta:** `packages/db` (PostgreSQL + Drizzle), `packages/shared` (tipos de cuenta, permisos, tablas y catálogo en español)
- **Monorepo:** pnpm + Turborepo
- **Tablas activas:** `user`, `session`, `account`, `verification`, `member_permission`, `member_table_access`, `data_base`, `data_table`, `data_field`, `data_row`, `data_cell`, `data_view`, `activity`. Las primeras sirven para Better Auth y el modelo de cuentas. `member_permission` guarda los permisos de cada hijo por módulo, acción y alcance. `member_table_access` guarda sus reglas de acceso a tablas (todos, un conjunto o una tabla) con capacidades y alcance de filas; la purga borra las reglas de conjuntos y tablas purgados. Las de datos guardan bases, tablas, campos, filas, celdas y vistas, siempre con el padre dueño. `data_base`, `data_table` y `data_row` tienen `deleted_at` para el borrado restaurable; los nombres únicos solo cuentan entre lo no borrado. `activity` guarda los avisos del espacio por padre, con autor, módulo, tipo, detalle y si se restauró; se purga a los 30 días.
- **Reglas activas en la base:** el correo es único y tiene que terminar en `@wanted.com`; solo puede existir un admin; un hijo exige `parent_id` y un padre o un admin no lo tienen; un trigger impide que un hijo dependa de alguien que no sea un usuario padre.
- **Tablas previstas:** contactos, empresas, oportunidades, pipelines, actividades, sesiones de WhatsApp, conversaciones, mensajes, automatizaciones, corridas y auditoría. Cada fila de negocio llevará el padre dueño.
- **Catálogo:** `packages/shared` exporta los textos en español (`es` y `t`), el modelo de permisos y los tipos de campo y de vista. Cubre la app, el acceso, el admin, los padres, los hijos y sus permisos, las tablas y los mensajes de la API. Las pantallas siguientes agregan sus claves ahí. No hay selector de idioma.
- **Pendiente en este paquete:** cliente de API y `packages/ui`.

## Pila

| Capa | Elección |
|---|---|
| Monorepo | pnpm + Turborepo |
| Web | Next.js |
| Escritorio | Tauri 2 |
| Móvil | Expo |
| API | NestJS |
| Base de datos | PostgreSQL |
| Esquema | Drizzle |
| Colas | Redis + BullMQ |
| Tiempo real | WebSockets |
| Auth | Better Auth, autoalojado |
| WhatsApp v1 | Worker de sesión Web |
| WhatsApp v2 | Cloud API, mismo adaptador |

## Orden de construcción

1. Base local: Compose, base de datos, catálogo en español, admin sembrado.
2. Admin y padres, con aislamiento en cada consulta.
3. Hijos y permisos.
4. Shell web responsivo.
5. Tablas.
6. CRM.
7. WhatsApp Web.
8. Automatizaciones.
9. Escritorio y móvil.
10. WhatsApp API, más idiomas y mudanza a la notebook.

Fase 5 cerrada. Fase en curso: ninguna. El siguiente trabajo es la fase 6: CRM.

## Registro de cambios

| Fecha | Cambio |
|---|---|
| 2026-10-14 | Se crea el contexto del proyecto y la regla que obliga a leerlo y actualizarlo. El repositorio aún no tiene código de producto. |
| 2026-10-14 | Fase 1: monorepo, Compose con PostgreSQL y Redis, esquema de cuentas, catálogo en español y siembra idempotente del admin. |
| 2026-10-14 | La pila local quedó levantada con Docker. En esta PC PostgreSQL se publica en el puerto 5433 porque el 5432 lo usa un PostgreSQL 18 de Windows. |
| 2026-10-14 | Fase 2: la API autentica al admin, crea y administra padres, y aísla el espacio de cada padre. La web tiene la sección de admin y la ficha del espacio. |
| 2026-10-14 | Fase 3: roles de fábrica y propios, alta de hijos y permisos por módulo, acción y alcance. El admin sigue sin crear hijos. |
| 2026-10-14 | El padre, o un hijo con permiso de administrar miembros, puede editar nombre, correo, contraseña y rol de sus hijos. |
| 2026-10-14 | Todo correo queda en @wanted.com. Al crear o editar, esa parte no se edita. En el inicio de sesión hay que escribir el correo completo, dominio incluido. |
| 2026-10-14 | Fase 4: shell web con barra lateral en escritorio y menú en el teléfono. Los módulos se muestran según el rol. |
| 2026-10-14 | Fase 5: bases y tablas por padre, con campos, filas, vistas, alcance del rol e importación y exportación CSV y Excel. |
| 2026-10-14 | En cada tabla se definen las columnas y se arma un formulario para cargar filas. |
| 2026-10-14 | El nombre de una base o tabla se puede cambiar después de crearla, y abrir una tabla entra a configurar sus columnas. |
| 2026-10-14 | Cada columna define para qué sirve, su tipo, su formato y si el valor es obligatorio, único o tiene un valor por defecto. La carga manual respeta esas reglas. |
| 2026-10-14 | Al entrar en Tablas, las tablas creadas se eligen con botones en fila. Debajo se ven sus datos y a un costado está el formulario para cargar filas. |
| 2026-10-14 | Crear una tabla abre un formulario para editar y agregar columnas. En una tabla existente también se agregan y se editan. El filtro se abre y se quita desde su botón. |
| 2026-10-14 | Crear y editar columnas abre un formulario flotante. Las columnas se editan juntas, en una tabla, desde un solo botón. |
| 2026-10-14 | En Tablas, crear, editar, exportar, importar y configurar pasan a una barra de iconos a la derecha. |
| 2026-10-14 | La grilla deja de mostrar la columna Asignado. Borrar una fila es un icono. |
| 2026-10-14 | La configuración de la vista se abre con un botón junto al filtro, en un formulario flotante. |
| 2026-10-14 | Con muchas columnas, la grilla y el formulario de columnas se desplazan en horizontal. |
| 2026-10-14 | La grilla deja la columna de borrar. Cada fila tiene un check y, al marcarlo, abajo flotan las acciones de esas filas, entre ellas borrar. |
| 2026-10-14 | El formulario pasa a la barra de iconos. El título de columna no muestra el tipo. Los avisos al guardar flotan y se van solos. |
| 2026-10-14 | La grilla solo muestra los datos. Para editar celdas se marcan las filas y Editar abre un formulario con esas filas. |
| 2026-10-14 | Con muchas filas, la tabla se desplaza en vertical y los títulos de las columnas quedan fijos. |
| 2026-10-14 | Agregar una fila exige que al menos una celda tenga contenido. |
| 2026-10-14 | Al elegir una celda y otra con Mayús, se eligen también las celdas del medio. |
| 2026-10-14 | Junto a Agregar fila se elige cuántas filas cargar de una vez. |
| 2026-10-14 | Todas las secciones comparten una barra flotante con el logo, la sección, las notificaciones y el perfil. |
| 2026-10-14 | El menú de módulos flota a la izquierda, en iconos o desplegado, y deja de mostrar el nombre de la cuenta. |
| 2026-10-14 | El botón para desplegar ese menú queda en la barra superior, a la izquierda del logo. |
| 2026-10-14 | El logo apila core debajo de WANTED, alineados a la derecha entre sí. |
| 2026-10-14 | La barra de iconos de Tablas se apoya en el borde derecho, con borde a la izquierda, arriba y abajo, y el mismo margen en los dos extremos. |
| 2026-10-14 | Tablas deja el título solo en la barra superior. |
| 2026-10-14 | El selector de tablas queda en una sección, con un botón por cada tabla. |
| 2026-10-14 | Crear tabla sale de la barra derecha y queda a la derecha del selector, separado. |
| 2026-10-14 | A la izquierda del selector de tablas hay un menú de conjuntos. Al crear una tabla se elige el conjunto. |
| 2026-10-14 | El contenido de Tablas usa el mismo margen de 12 px arriba, abajo y a la izquierda que la barra y los menús. |
| 2026-10-14 | Los formularios flotantes se ajustan a su contenido y difuminan el fondo. |
| 2026-10-14 | Cambiar de tabla dentro de un conjunto anima los botones y funde la grilla con un leve difuminado. |
| 2026-10-14 | Cambiar de conjunto funde el nombre, los botones de sus tablas y la grilla. |
| 2026-10-14 | La grilla toma la altura de sus filas y no pasa del alto disponible en la pantalla. |
| 2026-10-14 | La barra de la grilla queda en una línea: columnas y orden en menús, y el filtro con sus condiciones activas. |
| 2026-10-14 | Cambiar de tabla o de conjunto desplaza y funde la grilla; el conjunto también funde su nombre y sus botones. |
| 2026-10-15 | Sin conjuntos o sin tablas, el centro de Tablas lo avisa y ofrece crear lo que falte. |
| 2026-10-15 | Desde Editar se puede borrar un conjunto; se confirman y se borran también sus tablas. |
| 2026-10-15 | Sin conjuntos, la barra de iconos de la derecha de Tablas no se muestra. |
| 2026-10-15 | Sin conjuntos, el selector deja margen a la derecha; con conjunto vacío la barra solo importa. |
| 2026-10-15 | Al crear el primer conjunto, la barra derecha entra con animación. |
| 2026-10-15 | Crear tabla junto al selector solo aparece si el conjunto ya tiene tablas. |
| 2026-10-15 | Al crear una tabla, el botón en el selector y la grilla entran con animación. |
| 2026-10-15 | Al borrar una tabla o un conjunto, salen con animación y lo que queda entra suave. |
| 2026-10-16 | Los avisos sin conjuntos o sin tablas incluyen un dibujo minimalista en blanco y negro. |
| 2026-10-16 | La barra derecha deja Configurar; borrar tabla queda en Editar columnas. |
| 2026-10-16 | La barra Columnas / Orden / Filtro / Vista sale; el orden queda en cada encabezado. |
| 2026-10-16 | En la barra derecha, exportar CSV y Excel pasan a un solo botón con menú. |
| 2026-10-16 | La API acepta cuerpos JSON de hasta 32 MB para importar y exportar. |
| 2026-10-16 | La importación admite hasta 50.000 filas, CSV con `;` y mensajes de error claros. |
| 2026-10-16 | Importar siempre crea una tabla nueva en el conjunto activo. |
| 2026-10-16 | Al importar, un panel flotante muestra la carga y la tabla nueva entra sin recargar. |
| 2026-10-16 | La importación Excel tolera celdas vacías en el encabezado y valores enriquecidos. |
| 2026-10-16 | La importación Excel elige la hoja con datos, ignora dibujos y avisa si el archivo es .xls. |
| 2026-10-16 | La importación limita columnas usadas, carga en lote, revierte si falla; borrar tabla queda en Editar. |
| 2026-10-16 | Borrar tabla no queda bloqueado por la carga; tablas enormes se marcan y se eliminan por lotes. |
| 2026-10-16 | Al borrar una tabla, la UI pasa de inmediato a otra y el borrado corre en segundo plano. |
| 2026-10-16 | Abrir tablas enormes solo cuenta columnas; al borrar se abre otra tabla antes del DELETE. |
| 2026-10-16 | Borrar conjunto o tabla limpia celdas/filas/campos en orden y la UI no espera el DELETE. |
| 2026-10-16 | Tablas muestra carga mientras lista conjuntos; si la API no responde, avisa en lugar de quedar en blanco. |
| 2026-10-16 | Borrar tabla sale de la barra derecha; solo queda dentro de Editar columnas. |
| 2026-10-16 | Importar sale de la barra derecha; queda dentro del formulario Crear tabla. |
| 2026-10-16 | Crear tabla queda más limpio: identidad, importar y columnas esenciales. |
| 2026-10-16 | Crear tabla con muchas columnas: lista con scroll, cabecera y pie fijos. |
| 2026-10-16 | Editar columnas y formularios de conjuntos adoptan el mismo estilo que Crear tabla. |
| 2026-10-16 | Desde Editar conjuntos se puede crear un conjunto nuevo. |
| 2026-10-16 | En Editar conjuntos, cada uno despliega la lista de sus tablas. |
| 2026-10-16 | Abrir tabla carga filas por páginas y las anima al llegar. |
| 2026-10-16 | En la grilla, cada fila muestra su número junto al check. |
| 2026-10-17 | PostgreSQL local pasa al puerto 15433 porque Windows reservó el rango 5433–5632. |
| 2026-10-17 | La barra derecha de Tablas suma buscar, densidad de filas y recargar, con un estilo más sobrio. |
| 2026-10-17 | Los avisos de Tablas pasan a la campana: burbuja temporal, panel nuevo y color por tipo. |
| 2026-10-17 | Conjuntos, tablas y filas se borran con `deleted_at` y se restauran por 24 h desde el detalle del aviso. |
| 2026-10-17 | Registro de actividad `activity`: el padre ve en la campana los cambios de sus hijos en Tablas, con su autor. |
| 2026-10-17 | El identificador suma el formato código con cantidad de caracteres (`data_field.length`). |
| 2026-10-17 | El menú del perfil se rediseña y suma "Ver perfil" con un panel de datos de la cuenta. |
| 2026-10-17 | Usuarios hijo pasa a Configuración (ex Ajustes); Miembros sale de la barra izquierda. |
| 2026-10-18 | Configuración se separa en microsecciones con navegación propia. |
| 2026-10-18 | Usuarios hijo y Roles pasan a listas sobrias con formularios flotantes; editar un hijo permite suspender o reactivar su acceso. |
| 2026-10-18 | Se quitan los roles (`role`, `role_permission`, `member_role`): cada hijo tiene permisos propios por sección, miembros y conjunto o tabla (`member_permission`, `member_table_access`); los hijos existentes quedan sin permisos. |
