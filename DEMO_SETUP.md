# Demo para GitHub

Esta demo funciona con datos locales inventados. No necesita Supabase, no usa
credenciales y no contiene datos de produccion.

La app normal sigue separada:

- App normal: `index.html` y `src/App.jsx`
- App demo: `index-demo.html` y `src/App.demo.jsx`
- Datos demo: `src/lib/demoSeedData.js`
- Cliente demo/local: `src/lib/demoSupabaseClient.js`
- Imagenes demo: `public/demo-products/`

La demo carga clientes, productos, solicitudes, estados, categorias e imagenes
desde archivos locales. Cualquier creacion, edicion o eliminacion se guarda solo
en `localStorage` del navegador.

## Comandos

```bash
npm run dev:demo
npm run build:demo
```

El build demo sale en `dist-demo`.

El build tambien copia `index-demo.html` como `index.html` para que servicios
como Vercel puedan abrir la demo desde la raiz del dominio.

## Reiniciar cambios locales

La barra superior de la demo tiene un boton `Reiniciar demo`. Ese boton limpia
los cambios guardados en el navegador y vuelve a mostrar los datos iniciales.
