import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import dotenv from 'dotenv';
import venueRoutes from './routes/venues/index';

dotenv.config();

const server = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  }
});

server.register(cors, { origin: true });
server.register(helmet);
server.register(venueRoutes, { prefix: '/api/venues' });

server.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '0.1.0'
  };
});

server.get('/', async () => {
  return {
    name: 'EPoS Platform API',
    version: '0.1.0',
    status: 'running',
    endpoints: {
      health: '/health',
      venues: '/api/venues'
    }
  };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';
    await server.listen({ port, host });
    console.log(`\n🚀 EPoS API running at http://localhost:${port}`);
    console.log(`📋 Health check: http://localhost:${port}/health`);
    console.log(`🏪 Venues API:   http://localhost:${port}/api/venues\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
