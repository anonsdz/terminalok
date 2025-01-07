# Sử dụng Node.js mới nhất làm base
FROM node:latest

# Cập nhật hệ thống và cài đặt các công cụ cần thiết
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    htop \
    speedtest-cli \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Tạo thư mục trong container
WORKDIR /app

# Copy package.json và package-lock.json (nếu có) trước để cài đặt dependencies
COPY package*.json ./

# Cài đặt các phụ thuộc từ package.json
RUN npm install

# Copy tất cả các file còn lại vào thư mục container
COPY . .

# Cập nhật npm lên phiên bản mới nhất
RUN npm install -g npm@latest

# Mở port cho ứng dụng
EXPOSE 3000

# Chạy server.js
CMD ["node", "server.js"]
