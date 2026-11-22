FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && npm start"]
