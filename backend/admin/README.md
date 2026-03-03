# GoFix Admin (Vite + React)

Rápido panel de administración para `GoFix`.

Comandos:

```bash
cd backend/admin
npm install
npm run dev
```

Notas:
- La app hace llamadas a `/api/*` por defecto; puedes configurar `VITE_API_URL` en `.env` (por ejemplo `VITE_API_URL=https://tu-dominio`).
- Endpoints esperados: `POST /api/auth/login`, `GET|POST /api/services`.
