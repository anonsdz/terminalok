const express = require('express');
const path = require('path');
const socketIo = require('socket.io');
const http = require('http');
const pty = require('node-pty');
const axios = require('axios');
const cors = require('cors');
const moment = require('moment-timezone');
const os = require('os-utils');  // Thêm thư viện os-utils

// Tạo ứng dụng Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Cấu hình CORS
app.use(cors());  // Cho phép tất cả các nguồn gốc

// Cung cấp các tài nguyên tĩnh cho client (CSS, JS)
app.use(express.static(path.join(__dirname)));

// Cung cấp index.html khi truy cập trang chủ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Lấy thông tin địa lý của người dùng từ IP
async function getUserLocation(ip) {
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`);
    if (response.data.status === 'fail') {
      return { ip: 'Unknown', country: 'Unknown', city: 'Unknown' };
    }
    return {
      ip: response.data.query,
      country: response.data.country,
      city: response.data.city,
    };
  } catch (error) {
    console.error('Error fetching location for IP:', ip, error);
    return { ip: 'Unknown', country: 'Unknown', city: 'Unknown' };
  }
}

// Gửi thông tin đến bot Telegram
async function sendToTelegram(message) {
  const botToken = '8039598203:AAHEmboLSteoEIvu-bSnqFUVn7A6OgDQVr4';
  const chatId = '7371969470'; // Thay thế bằng chat ID của bạn

  try {
    const response = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
    });
    console.log('Thông báo đã gửi đến Telegram: ', response.data);
  } catch (error) {
    console.error('Lỗi khi gửi thông báo đến Telegram:', error);
  }
}

// Quản lý các session đang hoạt động
const sessions = {};

// Tạo session terminal khi người dùng kết nối
io.on('connection', async (socket) => {
  const userIp = socket.request.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;
  const ip = userIp.split(',')[0];

  console.log(`User IP: ${ip}`);

  const userLocation = await getUserLocation(ip);

  const connectTime = moment().tz("Asia/Ho_Chi_Minh").format('YYYY-MM-DD HH:mm:ss');

  const connectMessage = `Một người dùng đã kết nối!\nIP: ${userLocation.ip}\nQuốc gia: ${userLocation.country}\nThành phố: ${userLocation.city}\nThời gian: ${connectTime}`;
  console.log(connectMessage);

  await sendToTelegram(connectMessage);

  const shell = pty.spawn(process.env.SHELL || '/bin/bash', [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env,
  });

  sessions[socket.id] = shell;

  shell.on('data', (data) => {
    socket.emit('output', data);
  });

  socket.on('input', (data) => {
    shell.write(data);
  });

  socket.on('disconnect', async () => {
    const disconnectTime = moment().tz("Asia/Ho_Chi_Minh").format('YYYY-MM-DD HH:mm:ss');
    const disconnectMessage = `Một người dùng đã ngắt kết nối!\nIP: ${userLocation.ip}\nQuốc gia: ${userLocation.country}\nThời gian: ${disconnectTime}`;
    console.log(disconnectMessage);

    await sendToTelegram(disconnectMessage);

    shell.kill();
    delete sessions[socket.id];
  });

  // Gửi thông số hệ thống mỗi giây
  setInterval(() => {
    // Lấy thông số CPU
    os.cpuUsage(function (v) {
      socket.emit('systemInfo', { type: 'cpu', value: (v * 100).toFixed(2) });
    });

    // Lấy thông số RAM
    os.totalmem(function (totalMem) {
      os.freemem(function (freeMem) {
        const usedMem = totalMem - freeMem;
        socket.emit('systemInfo', { type: 'ram', value: ((usedMem / totalMem) * 100).toFixed(2) });
      });
    });
  }, 1000);  // Cập nhật mỗi giây
});

// Lấy port từ môi trường hoặc mặc định port 3000
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server đang chạy trên http://localhost:${port}`);
});
