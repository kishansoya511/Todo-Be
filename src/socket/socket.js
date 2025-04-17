const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { createNotification } = require('../controllers/notificationController');

// Store connected users
const connectedUsers = new Map();

const initializeSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      // Allow connections from any origin during development
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Socket.io middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.userId);
    
    // Store user connection
    connectedUsers.set(socket.userId, socket.id);

    // Join user's room for private messages
    socket.join(`user:${socket.userId}`);

    // Handle task updates
    socket.on('task:update', async (data) => {
      // Notify all assignees
      for (const assigneeId of data.assignees) {
        // If user is connected, send real-time notification
        if (connectedUsers.has(assigneeId)) {
          io.to(connectedUsers.get(assigneeId)).emit('task:update', data);
        } else {
          // Store notification for offline user
          await createNotification(
            assigneeId,
            'task:update',
            data.taskId,
            `Task "${data.task?.title || 'Unknown'}" has been updated`
          );
        }
      }
    });

    // Handle task assignments
    socket.on('task:assign', async (data) => {
      // If assignee is connected, send real-time notification
      if (connectedUsers.has(data.assigneeId)) {
        io.to(connectedUsers.get(data.assigneeId)).emit('task:assign', data);
      } else {
        // Store notification for offline user
        await createNotification(
          data.assigneeId,
          'task:assign',
          data.taskId,
          `You have been assigned to task "${data.task?.title || 'Unknown'}"`
        );
      }
    });

    // Handle new comments
    socket.on('comment:new', async (data) => {
      // Notify task creator and assignees
      const usersToNotify = [data.taskCreator, ...data.assignees];
      for (const userId of usersToNotify) {
        // Skip duplicates and creator of the comment if they're in the list
        if (userId === socket.userId) continue;
        
        // If user is connected, send real-time notification
        if (connectedUsers.has(userId)) {
          io.to(connectedUsers.get(userId)).emit('comment:new', data);
        } else {
          // Store notification for offline user
          await createNotification(
            userId,
            'comment:new',
            data.taskId,
            `New comment on task "${data.task?.title || 'Unknown'}"`
          );
        }
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.userId);
      connectedUsers.delete(socket.userId);
      io.emit('user:disconnect', { userId: socket.userId });
    });
  });

  return io;
};

module.exports = initializeSocket; 