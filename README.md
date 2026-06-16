# Repuestos Industriales

Aplicacion web para gestionar clientes, productos, solicitudes y reportes de
repuestos industriales.

El proyecto tiene dos entradas:

- **Aplicacion principal:** usa la configuracion real del proyecto.
- **Demo publica:** usa datos locales inventados, imagenes locales y cambios
  guardados solo en el navegador.

## Demo local

La demo no necesita Supabase ni credenciales.

```bash
npm install
npm run dev:demo
```

Luego abre:

```text
http://localhost:5173/index-demo.html
```

## Datos demo

Los datos demo viven en:

```text
src/lib/demoSeedData.js
```

Las imagenes demo de productos viven en:

```text
public/demo-products/
```

Cuando alguien crea, edita, elimina o importa datos en la demo, esos cambios se
guardan en `localStorage`. No se modifica ninguna base de datos externa.

## Reiniciar la demo

La barra superior muestra el indicador `DEMO` y un boton `Reiniciar demo`.
Ese boton limpia los cambios locales del navegador y vuelve a los datos
iniciales.

## Build

Build de produccion de la app principal:

```bash
npm run build
```

Build de la demo para publicar:

```bash
npm run build:demo
```

El build demo se genera en:

```text
dist-demo/
```

Ese comando deja disponibles `dist-demo/index-demo.html` y `dist-demo/index.html`.
El segundo es importante para Vercel, porque la raiz del sitio debe abrir un
`index.html`.

## Vercel

Para publicar la demo sin afectar la app de produccion, crea un proyecto Vercel
separado para la demo y usa estos settings:

```text
Framework Preset: Vite
Build Command: npm run build:demo
Output Directory: dist-demo
Install Command: npm install
```

No cambies esos settings en el proyecto Vercel que usa la app real, porque ese
link se actualizaria con la demo. Para la app real, deja el build normal:

```text
Build Command: npm run build
Output Directory: dist
```

## Publicacion en GitHub Pages

El repositorio incluye el workflow:

```text
.github/workflows/demo-pages.yml
```

Cuando se suben cambios a `main`, GitHub Actions instala dependencias, ejecuta
`npm run build:demo` y publica la carpeta `dist-demo` en GitHub Pages.

## Tecnologias

- React
- Vite
- Supabase JS en la app principal
- ExcelJS y jsPDF para exportaciones
