Shift Manager WebN6 - Vercel + PIN + Nube

PIN por defecto: 6426. En Vercel configurar APP_PIN=6426.

Datos persistentes:
- Usa Upstash Redis mediante variables UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.
- Si esas variables no existen, en desarrollo local usa /tmp temporal.

Probar local:
1) npm install
2) npx vercel dev
3) abrir http://localhost:3000

Deploy en Vercel:
1) Subir esta carpeta a GitHub.
2) Importar proyecto en Vercel.
3) Agregar integración Upstash Redis desde Vercel Marketplace.
4) Variables de entorno: APP_PIN=6426 y APP_SECRET=<texto-largo-cualquiera>.
5) Deploy.

WebN4:
- Encabezado visible removido.
- Botón Ocultar controles para maximizar la tabla.
- Fecha con calendario nativo input type=date.

WebN5:
- H suma en tiros, pero no suma en Hay / puestos totales.

WebN6:
- Arnaldo Andrade y Cristina Ayala quedan como Inactivo según indicación del usuario.
- La web app fuerza esos estados al leer la nube y los vuelve a guardar automáticamente.
