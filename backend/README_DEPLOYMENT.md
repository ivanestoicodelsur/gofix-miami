**Despliegue en VPS / Hostinger (EasyPanel)**

- Opción A — Usando Docker (recomendado):
  1. Construir la imagen: `docker build -t gofix-backend .`
  2. Ejecutar (ejemplo): `docker run -d -p 4000:4000 --env-file .env --name gofix-backend gofix-backend`
  3. Asegúrate de que `.env` contiene `DATABASE_URL` y `JWT_SECRET`.

- Opción B — Usando Node.js / EasyPanel:
  1. Subir los archivos al servidor (SFTP/Git).
  2. En el panel de EasyPanel crea una App Node.js (o usa SSH).
  3. Establece variables de entorno (`PORT`, `DATABASE_URL`, `JWT_SECRET`).
  4. Desde la carpeta `backend` ejecuta:
     ```bash
     npm install
     npx prisma generate
     npm run build
     npm run start:prod
     ```
  5. Alternativa con `pm2`:
     ```bash
     npm install -g pm2
     pm2 start ecosystem.config.js --env production
     pm2 save
     ```

- Notas:
  - Si usas Hostinger EasyPanel, puedes configurar la aplicación para que arranque con pm2 o mediante Docker. EasyPanel facilita la carga de variables de entorno.
  - Verifica la conectividad del `DATABASE_URL` desde el VPS (puede requerir reglas de firewall o permitir acceso desde el host).
