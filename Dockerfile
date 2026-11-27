FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npm run build
# Node's default thread pool is 4: file writes, hashing and image work all share it, so uploads starve page loads.
ENV UV_THREADPOOL_SIZE=8
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && npm start"]
