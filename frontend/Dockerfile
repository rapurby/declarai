# ---------- Stage 1: Build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_URL harus tersedia SAAT BUILD (di-bake ke bundle oleh Vite).
# Railway otomatis meneruskan service variables sebagai build args
# selama dideklarasikan dengan ARG di sini.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------- Stage 2: Serve ----------
FROM node:20-alpine
# Install `serve` global di dalam image — tidak menyentuh package-lock.json
RUN npm install -g serve@14

WORKDIR /app
COPY --from=build /app/dist ./dist

EXPOSE 8080

# -s = SPA mode: semua route fallback ke index.html (untuk React Router)
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
