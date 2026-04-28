FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --legacy-peer-deps weil @vitejs/plugin-react seit 4.7 strenger gegen
# vite-Versionen prüft und sonst „Found: vite@undefined" wirft, obwohl
# vite^5.4 in devDependencies steht. Kein lockfile im Repo, daher kein npm ci.
RUN npm install --legacy-peer-deps
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
