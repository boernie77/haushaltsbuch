FROM node:20-alpine

RUN apk add --no-cache vips-dev fftw-dev gcc g++ make python3 openssh-keygen

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p uploads/temp

EXPOSE 3000

CMD ["node", "server.js"]
