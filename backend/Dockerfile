FROM node:20-alpine

# postgresql16-client: pg_dump/pg_restore für das globale Backup (Version
# passend zum DB-Image postgres:16)
RUN apk add --no-cache vips-dev fftw-dev gcc g++ make python3 openssh-keygen postgresql16-client

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p uploads/temp

EXPOSE 3000

CMD ["node", "server.js"]
