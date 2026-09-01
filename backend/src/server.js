import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs-extra';
import config from './config.js';
import { JobManager } from './jobs/JobManager.js';
import { createApiRouter } from './routes/api.js';

// Ensure directories exist
fs.ensureDirSync(config.paths.uploads);
fs.ensureDirSync(config.paths.output);
fs.ensureDirSync(config.paths.temp);
fs.ensureDirSync(config.paths.cache);
fs.ensureDirSync(config.paths.fonts);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.frontendUrl, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

import path from 'path';

// Serve output videos statically
app.use('/output', express.static(config.paths.output));

// Serve frontend statically in production (for Electron)
const frontendPath = process.env.FRONTEND_PATH || path.resolve(config.paths.root, 'frontend/dist');
app.use(express.static(frontendPath));

// Initialize JobManager with WebSocket io instance
const jobManager = new JobManager(io);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Client joins a room specific to their job ID to get updates
  socket.on('subscribe_job', (jobId) => {
    socket.join(jobId);
    console.log(`Socket ${socket.id} subscribed to job ${jobId}`);

    // Send immediate status upon subscription
    const job = jobManager.getJob(jobId);
    if (job) {
      socket.emit('job_update', job);
    }
  });

  // Client requests to cancel a job
  socket.on('cancel_job', (jobId) => {
    console.log(`Client requested cancellation for job ${jobId}`);
    jobManager.cancelJob(jobId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// API Routes
const apiRouter = createApiRouter(jobManager);
app.use('/api', apiRouter);

// Start server
server.listen(config.port, () => {
  console.log(`🚀 Avatar Pipeline Backend running on http://localhost:${config.port}`);
});
