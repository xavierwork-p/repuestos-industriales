# Repuestos Industriales

Aplicacion web para gestionar clientes, productos, solicitudes y reportes de
repuestos industriales. La app principal trabaja con Supabase y tambien incluye
una version demo publica que funciona solo con datos locales inventados.

## Funcionalidades

- Panel principal con resumen de clientes, productos y solicitudes.
- Gestion de clientes con busqueda, creacion, edicion y eliminacion.
- Catalogo de productos con categorias, codigos, marcas e imagenes.
- Registro de solicitudes por cliente, producto, cantidad, fecha y estado.
- Historial por cliente y por producto.
- Reportes filtrados por fecha, cliente, producto, estado, categoria y marca.
- Exportacion de reportes en Excel y PDF.
- Importacion de datos desde Excel con vista previa, advertencias y errores.
- Version demo segura para publicar sin tocar la base de datos real.

## Versiones del proyecto

| Version | Entrada | Datos | Uso recomendado |
| --- | --- | --- | --- |
| App principal | `index.html` / `src/App.jsx` | Supabase real | Uso interno o produccion |
| Demo publica | `index-demo.html` / `src/App.demo.jsx` | Archivos locales | GitHub, Vercel o pruebas publicas |

La demo no necesita Supabase, no usa credenciales y no contiene datos de
produccion. Los cambios que haga una persona en la demo se guardan solo en el
navegador mediante `localStorage`.

## Demo segura

https://repuestos-industriales-demo.vercel.app/

La demo carga datos desde:

```text
src/lib/demoSeedData.js
```

Las imagenes locales de productos estan en:

```text
public/demo-products/
```

El cliente local que imita las operaciones necesarias de Supabase esta en:

```text
src/lib/demoSupabaseClient.js
```

La barra superior de la demo muestra el indicador `DEMO` y un boton para
reiniciar los cambios locales. Ese boton limpia los datos guardados en el
navegador y vuelve a cargar la informacion inicial.

## Requisitos

- Node.js
- npm

## Instalacion

```bash
npm install
```

## Ejecutar la demo

```bash
npm run dev:demo
```

Luego abre:

```text
http://localhost:5173/index-demo.html
```

## Ejecutar la app principal

La app principal requiere variables de entorno de Supabase en un archivo `.env`.
Ese archivo no debe subirse a GitHub.

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

Despues ejecuta:

```bash
npm run dev
```

## Scripts disponibles

```bash
npm run dev
```

Inicia la app principal.

```bash
npm run dev:demo
```

Inicia la version demo.

```bash
npm run build
```

Genera el build de produccion en `dist`.

```bash
npm run build:demo
```

Genera el build de la demo en `dist-demo`.

```bash
npm run lint
```

Revisa el codigo con ESLint.

## Publicar en Vercel

Para evitar afectar el link de produccion, publica la demo en un proyecto Vercel
separado.

Configuracion recomendada para la demo:

```text
Framework Preset: Vite
Build Command: npm run build:demo
Output Directory: dist-demo
Install Command: npm install
```

Configuracion recomendada para la app principal:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

No uses la configuracion de demo en el proyecto Vercel de produccion, porque ese
link se actualizaria con la version demo.

## Publicar en GitHub Pages

El repositorio incluye este workflow:

```text
.github/workflows/demo-pages.yml
```

Cuando se suben cambios a `main`, GitHub Actions puede construir la demo con:

```bash
npm run build:demo
```

y publicar la carpeta:

```text
dist-demo/
```

## Estructura importante

```text
src/App.jsx                  App principal
src/App.demo.jsx             App demo
src/lib/supabaseClient.js    Cliente Supabase real
src/lib/demoSupabaseClient.js Cliente local para demo
src/lib/demoSeedData.js      Datos inventados de demo
public/demo-products/        Imagenes inventadas de productos
index.html                   Entrada principal
index-demo.html              Entrada demo
DEMO_SETUP.md                Notas tecnicas de la demo
```

## Seguridad

- No subir `.env`, `.env.local` ni credenciales a GitHub.
- No usar datos reales de clientes o productos en la demo publica.
- Mantener la app principal y la demo como proyectos separados en Vercel.
- La demo esta pensada para probar la interfaz sin modificar ninguna base de
  datos externa.

## Tecnologias

- React
- Vite
- Supabase JS
- ExcelJS
- jsPDF
- Recharts
- Lucide React
