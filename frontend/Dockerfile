# Imagen de producción del frontend: build de Vite y servidor estático SPA.
# Las variables VITE_* se leen en tiempo de compilación (import.meta.env): se pasan como build args.
# Nunca reciben claves de servicio. Solo claves públicas (anon) y URLs.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve@14

COPY --from=builder /app/dist ./dist

EXPOSE 5173

# -s: fallback a index.html para rutas SPA (/cuenta, /mercado/oferta/:id, /juegos/ranking...).
CMD ["serve", "-s", "dist", "-l", "5173"]
