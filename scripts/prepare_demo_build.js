import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const demoHtml = resolve('dist-demo', 'index-demo.html')
const indexHtml = resolve('dist-demo', 'index.html')

if (!existsSync(demoHtml)) {
  throw new Error('No se encontro dist-demo/index-demo.html. Ejecuta primero el build demo.')
}

copyFileSync(demoHtml, indexHtml)
console.log('Demo ready: dist-demo/index.html')
