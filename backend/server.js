import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import Document from './models/Document.js';
import UserSession from './models/UserSession.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001"],
  credentials: true
}));

app.use(express.json());


mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to local MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

app.get('/api/document/:id', async (req, res) => {
  try {
    const documentId = req.params.id;
    let document = await Document.findById(documentId);
    
    if (!document) {
      document = new Document({
        _id: documentId,
        title: `Document ${documentId}`,
        owner: 'system'
      });
      await document.save();
    }
    
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

app.post('/api/document/:id/save', async (req, res) => {
  try {
    const documentId = req.params.id;
    const { content, title } = req.body;
    
    const document = await Document.findByIdAndUpdate(
      documentId,
      {
        content,
        ...(title && { title }),
        lastSaved: new Date()
      },
      { new: true, upsert: true }
    );
    
    res.json({ success: true, document });
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: 'Failed to save document' });
  }
});

app.get('/api/documents', async (req, res) => {
  try {
    const documents = await Document.find()
      .sort({ lastSaved: -1 })
      .limit(50);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-document', async ({ documentId, user }) => {
    try {
      socket.join(documentId);
      
      await UserSession.findOneAndUpdate(
        { socketId: socket.id },
        {
          socketId: socket.id,
          userId: socket.id,
          userName: user.name,
          userColor: user.color,
          documentId: documentId
        },
        { upsert: true, new: true }
      );
      
      const document = await Document.findById(documentId);
      if (document) {
        socket.emit('document-loaded', document);
      }
      
      const activeSessions = await UserSession.find({ documentId });
      const userList = activeSessions.map(session => ({
        id: session.socketId,
        name: session.userName,
        color: session.userColor
      }));
      
      io.to(documentId).emit('document-users', userList);
      socket.to(documentId).emit('user-joined', {
        id: socket.id,
        name: user.name,
        color: user.color
      });
      
      console.log(`User ${user.name} joined document ${documentId}`);
    } catch (error) {
      console.error('Error joining document:', error);
    }
  });

  socket.on('send-changes', async ({ documentId, delta }) => {
    try {
      socket.to(documentId).emit('receive-changes', {
        delta,
        userId: socket.id
      });
      
      await UserSession.findOneAndUpdate(
        { socketId: socket.id },
        { lastActive: new Date() }
      );
    } catch (error) {
      console.error('Error sending changes:', error);
    }
  });

  socket.on('save-document', async ({ documentId, content, title }) => {
    try {
      await Document.findByIdAndUpdate(
        documentId,
        {
          content,
          ...(title && { title }),
          lastSaved: new Date()
        },
        { new: true }
      );
      console.log(`Document ${documentId} saved`);
    } catch (error) {
      console.error('Error saving document:', error);
    }
  });

  socket.on('update-document-title', async ({ documentId, title }) => {
    try {
      await Document.findByIdAndUpdate(documentId, { title });
      socket.to(documentId).emit('document-title-updated', { title });
    } catch (error) {
      console.error('Error updating title:', error);
    }
  });

  socket.on('disconnect', async () => {
    try {
      console.log('User disconnected:', socket.id);
      const userSession = await UserSession.findOne({ socketId: socket.id });
      
      if (userSession) {
        const { documentId } = userSession;
        await UserSession.deleteOne({ socketId: socket.id });
        
        const activeSessions = await UserSession.find({ documentId });
        const userList = activeSessions.map(session => ({
          id: session.socketId,
          name: session.userName,
          color: session.userColor
        }));
        
        io.to(documentId).emit('document-users', userList);
        io.to(documentId).emit('user-left', { id: socket.id });
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

setInterval(async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const inactiveSessions = await UserSession.find({ 
      lastActive: { $lt: fiveMinutesAgo } 
    });
    
    for (const session of inactiveSessions) {
      io.to(session.documentId).emit('user-left', { id: session.socketId });
      await UserSession.deleteOne({ _id: session._id });
    }
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`❤️ Health check: http://localhost:${PORT}/health`);
});