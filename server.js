const express = require('express');
const path = require('path');
const socketIo = require('socket.io');
const http = require('http');
const pty = require('node-pty');
const axios = require('axios');
const cors = require('cors');
const moment = require('moment-timezone');  // Thêm thư viện moment-timezone để lấy giờ VN

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
  // Lấy IP người dùng từ header 'X-Forwarded-For' hoặc 'remoteAddress'
  const userIp = socket.request.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;
  // Kiểm tra nếu có nhiều IP trong 'X-Forwarded-For' (có thể có nhiều proxy), ta lấy IP đầu tiên
  const ip = userIp.split(',')[0];

  console.log(`User IP: ${ip}`);  // Log IP để kiểm tra

  const userLocation = await getUserLocation(ip);

  // Lấy thời gian kết nối theo giờ VN
  const connectTime = moment().tz("Asia/Ho_Chi_Minh").format('YYYY-MM-DD HH:mm:ss');

  // Log thông tin người dùng và gửi đến Telegram
  const connectMessage = `Một người dùng đã kết nối!\nIP: ${userLocation.ip}\nQuốc gia: ${userLocation.country}\nThành phố: ${userLocation.city}\nThời gian: ${connectTime}`;
  console.log(connectMessage);

  // Gửi thông tin đến bot Telegram
  await sendToTelegram(connectMessage);

  const shell = pty.spawn(process.env.SHELL || '/bin/bash', [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env,
  });

  sessions[socket.id] = shell;

  // Lắng nghe đầu ra của terminal và truyền qua socket
  shell.on('data', (data) => {
    socket.emit('output', data);
  });

  // Nhận dữ liệu từ client và gửi đến terminal
  socket.on('input', (data) => {
    shell.write(data);
  });

  // Ngắt kết nối và đóng terminal khi người dùng rời đi
  socket.on('disconnect', async () => {
    // Lấy thời gian ngắt kết nối theo giờ VN
    const disconnectTime = moment().tz("Asia/Ho_Chi_Minh").format('YYYY-MM-DD HH:mm:ss');
    const disconnectMessage = `Một người dùng đã ngắt kết nối!\nIP: ${userLocation.ip}\nQuốc gia: ${userLocation.country}\nThời gian: ${disconnectTime}`;
    console.log(disconnectMessage);

    // Gửi thông báo ngắt kết nối về Telegram
    await sendToTelegram(disconnectMessage);

    shell.kill();
    delete sessions[socket.id];  // Xóa session khỏi map
  });
});

// Lấy port từ môi trường hoặc mặc định port 3000
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server đang chạy trên http://localhost:${port}`);
});
